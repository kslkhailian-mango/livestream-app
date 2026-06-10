require("dotenv").config();

const mongoose = require("mongoose");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = process.env.PORT || 3000;

// ================= MONGODB =================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

mongoose.connection.on("connected", () => {
  console.log("DB READY");
});

mongoose.connection.on("error", (err) => {
  console.log("DB ERROR:", err);
});

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: "livestream-secret",
  resave: false,
  saveUninitialized: false
}));

app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

// ================= UPLOAD SETUP =================
if (!fs.existsSync("public/uploads")) {
  fs.mkdirSync("public/uploads", { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/uploads");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });
app.post("/upload-profile-image", upload.single("image"), async (req, res) => {
  try {
    const { username, type } = req.body;

    if (!username || !type) {
      return res.json({
        success: false,
        message: "Username and type required"
      });
    }

    if (!req.file) {
      return res.json({
        success: false,
        message: "No image uploaded"
      });
    }

    if (type !== "avatar" && type !== "cover") {
      return res.json({
        success: false,
        message: "Invalid image type"
      });
    }

    const imageUrl = "/uploads/" + req.file.filename;

    const updateData = {};

    if (type === "avatar") {
      updateData.avatar = imageUrl;
    }

    if (type === "cover") {
      updateData.cover = imageUrl;
    }

    const user = await User.findOneAndUpdate(
      { username },
      updateData,
      { new: true }
    );

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      url: imageUrl,
      avatar: user.avatar,
      cover: user.cover
    });

  } catch (err) {
    console.log("UPLOAD PROFILE IMAGE ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server upload error"
    });
  }
});
// ================= USER SCHEMA =================
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true
  },

  userId: {
    type: String,
    unique: true
  },

  avatar: {
    type: String,
    default: "/default-avatar.png"
  },

  cover: {
    type: String,
    default: "/default-cover.jpg"
  },

  followers: {
    type: Number,
    default: 0
  },

  following: {
    type: Number,
    default: 0
  },

  followersList: {
    type: [String],
    default: []
  },

  followingList: {
    type: [String],
    default: []
  },

  goldCoins: {
    type: Number,
    default: 1650
  },

  silverCoins: {
    type: Number,
    default: 1918
  },

  level: {
    type: Number,
    default: 2
  },

  vip: {
    type: Number,
    default: 5
  },

  diamonds: {
    type: Number,
    default: 66
  },

  visitors: {
    type: Number,
    default: 0
  },

  bio: {
    type: String,
    default: ""
  },

  topFans: {
    type: [{
      username: String,
      amount: Number,
      avatar: String
    }],
    default: []
  }
});

const User = mongoose.model("User", userSchema);

// ================= LIVE MEMORY =================
const broadcasters = {};
const viewerCounts = {};
const liveRooms = {};
const roomViewers = {};

// ================= PAGE ROUTES =================
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/home.html");
});

app.get("/home", (req, res) => {
  res.sendFile(__dirname + "/public/home.html");
});

app.get("/profile", (req, res) => {
  res.sendFile(__dirname + "/public/profile.html");
});

app.get("/watch", (req, res) => {
  res.sendFile(__dirname + "/public/watch.html");
});

// ================= AUTH =================
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({
        success: false,
        message: "Username and password required"
      });
    }

    const existing = await User.findOne({ username });

    if (existing) {
      return res.json({
        success: false,
        message: "Username already exists"
      });
    }
    const userId =
       Math.floor(100000 + Math.random() * 900000).toString();
    const user = new User({
      username,
      password,
      userId
    });

    await user.save();

    req.session.user = {
      username: user.username
    };

    res.json({
      success: true,
      message: "Registered",
      username: user.username,
      avatar: user.avatar
    });

  } catch (err) {
    console.log("REGISTER ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Register server error"
    });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username, password });

    if (!user) {
      return res.json({
        success: false,
        message: "Wrong username or password"
      });
    }

    req.session.user = {
      username: user.username
    };

    res.json({
      success: true,
      username: user.username,
      avatar: user.avatar
    });

  } catch (err) {
    console.log("LOGIN ERROR:", err);

    res.status(500).json({
      success: false,
      message: "Server login error"
    });
  }
});

app.get("/me", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({
        loggedIn: false
      });
    }

    const user = await User.findOne({
      username: req.session.user.username
    });

    if (!user) {
      return res.json({
        loggedIn: false
      });
    }

    res.json({
      loggedIn: true,
      username: user.username,
      avatar: user.avatar,
      cover: user.cover,
      goldCoins: user.goldCoins,
      silverCoins: user.silverCoins,
      level: user.level,
      vip: user.vip,
      diamonds: user.diamonds
    });

  } catch (err) {
    console.log("ME ERROR:", err);
    res.json({ loggedIn: false });
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      success: true,
      message: "Logged out"
    });
  });
});

// ================= PROFILE =================
app.get("/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({
      username: req.params.username
    });

    if (!user) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    if (
      req.session.user &&
      req.session.user.username !== req.params.username
    ) {
      user.visitors += 1;
      await user.save();
    }

    res.json({
      success: true,
      username: user.username,
      userId: user.userId,
      avatar: user.avatar,
      cover: user.cover,
      followers: user.followers,
      following: user.following,
      followersList: user.followersList || [],
      followingList: user.followingList || [],
      goldCoins: user.goldCoins || 0,
      silverCoins: user.silverCoins || 0,
      level: user.level || 1,
      vip: user.vip || 0,
      diamonds: user.diamonds || 0,
      visitors: user.visitors || 0,
      bio: user.bio || "",
      topFans: user.topFans || [],
      isMe: req.session.user
        ? req.session.user.username === user.username
        : false,
      isFollowing: req.session.user
        ? user.followersList.includes(req.session.user.username)
        : false
    });

  } catch (err) {
    console.log("PROFILE ERROR:", err);
    res.status(500).json({ success: false });
  }
});

app.post("/update-profile/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const { avatar, cover, bio } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false });
    }

    if (avatar) user.avatar = avatar;
    if (cover) user.cover = cover;
    if (bio !== undefined) user.bio = bio;

    await user.save();

    res.json({
      success: true,
      avatar: user.avatar,
      cover: user.cover,
      bio: user.bio
    });

  } catch (err) {
    console.log("UPDATE PROFILE ERROR:", err);
    res.json({ success: false });
  }
});

// ================= AVATAR / COVER UPLOAD =================
app.post("/upload-avatar", upload.single("avatar"), async (req, res) => {
  try {
    const { username } = req.body;

    if (!req.file) {
      return res.json({
        success: false,
        message: "No file uploaded"
      });
    }

    const avatarPath = "/uploads/" + req.file.filename;

    await User.findOneAndUpdate(
      { username },
      { avatar: avatarPath }
    );

    res.json({
      success: true,
      avatar: avatarPath
    });

  } catch (err) {
    console.log("UPLOAD AVATAR ERROR:", err);
    res.status(500).json({ success: false });
  }
});

app.post("/upload-cover", upload.single("cover"), async (req, res) => {
  try {
    const { username } = req.body;

    if (!req.file) {
      return res.json({
        success: false,
        message: "No file uploaded"
      });
    }

    const coverPath = "/uploads/" + req.file.filename;

    await User.findOneAndUpdate(
      { username },
      { cover: coverPath }
    );

    res.json({
      success: true,
      cover: coverPath
    });

  } catch (err) {
    console.log("UPLOAD COVER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// ================= FOLLOW / UNFOLLOW =================
app.post("/follow/:username", async (req, res) => {
  try {
    const targetUsername = req.params.username;
    const { currentUser } = req.body;

    if (!currentUser) {
      return res.json({
        success: false,
        message: "Please login first"
      });
    }

    if (currentUser === targetUsername) {
      return res.json({
        success: false,
        message: "You cannot follow yourself"
      });
    }

    const targetUser = await User.findOne({ username: targetUsername });
    const me = await User.findOne({ username: currentUser });

    if (!targetUser || !me) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    if (targetUser.followersList.includes(currentUser)) {
      return res.json({
        success: false,
        message: "Already following",
        followers: targetUser.followers,
        following: me.following
      });
    }

    targetUser.followersList.push(currentUser);
    targetUser.followers = targetUser.followersList.length;

    me.followingList.push(targetUsername);
    me.following = me.followingList.length;

    await targetUser.save();
    await me.save();

    res.json({
      success: true,
      message: "Followed",
      followers: targetUser.followers,
      following: me.following
    });

  } catch (err) {
    console.log("FOLLOW ERROR:", err);
    res.status(500).json({ success: false });
  }
});

app.post("/unfollow/:username", async (req, res) => {
  try {
    const targetUsername = req.params.username;
    const { currentUser } = req.body;

    if (!currentUser) {
      return res.json({
        success: false,
        message: "Please login first"
      });
    }

    const targetUser = await User.findOne({ username: targetUsername });
    const me = await User.findOne({ username: currentUser });

    if (!targetUser || !me) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    targetUser.followersList = targetUser.followersList.filter(
      name => name !== currentUser
    );

    me.followingList = me.followingList.filter(
      name => name !== targetUsername
    );

    targetUser.followers = targetUser.followersList.length;
    me.following = me.followingList.length;

    await targetUser.save();
    await me.save();

    res.json({
      success: true,
      message: "Unfollowed",
      followers: targetUser.followers,
      following: me.following
    });

  } catch (err) {
    console.log("UNFOLLOW ERROR:", err);
    res.status(500).json({ success: false });
  }
});

// ================= COINS =================
app.post("/add-coins/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const { amount, coinType } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false });
    }

    if (coinType === "silver") {
      user.silverCoins += Number(amount);
    } else {
      user.goldCoins += Number(amount);
    }

    await user.save();

    res.json({
      success: true,
      goldCoins: user.goldCoins,
      silverCoins: user.silverCoins
    });

  } catch (err) {
    console.log("ADD COINS ERROR:", err);
    res.json({ success: false });
  }
});

app.get("/fix-user-ids", async (req, res) => {
  try {

    const users = await User.find({
      $or: [
        { userId: { $exists: false } },
        { userId: null },
        { userId: "" }
      ]
    });

    for (const user of users) {
      user.userId =
        Math.floor(100000 + Math.random() * 900000).toString();

      await user.save();
    }

    res.json({
      success: true,
      fixed: users.length
    });

  } catch (err) {
    console.log("FIX USER IDS ERROR:", err);

    res.json({
      success: false
    });
  }
});

app.get("/test-coins/:username", async (req, res) => {
  const user = await User.findOne({ username: req.params.username });

  if (!user) {
    return res.json({
      success: false,
      message: "User not found"
    });
  }

  user.goldCoins += 1000;
  user.silverCoins += 1000;

  await user.save();

  res.json({
    success: true,
    username: user.username,
    goldCoins: user.goldCoins,
    silverCoins: user.silverCoins
  });
});

// ================= GIFTS =================
const gifts = [
  { id: "rose", name: "Rose", price: 10, coinType: "silver", emoji: "🌹" },
  { id: "heart", name: "Heart", price: 30, coinType: "silver", emoji: "💖" },
  { id: "star", name: "Star", price: 50, coinType: "silver", emoji: "⭐" },
  { id: "crown", name: "Crown", price: 100, coinType: "gold", emoji: "👑" },
  { id: "dragon", name: "Dragon", price: 500, coinType: "gold", emoji: "🐉" },
  { id: "rocket", name: "Rocket", price: 500, coinType: "gold", emoji: "🚀" }
];

app.get("/gifts", (req, res) => {
  res.json(gifts);
});

app.post("/send-gift", async (req, res) => {
  try {
    const { senderUsername, receiverUsername, giftId } = req.body;

    const gift = gifts.find(g => g.id === giftId);

    if (!gift) {
      return res.json({
        success: false,
        message: "Gift not found"
      });
    }

    if (senderUsername === receiverUsername) {
      return res.json({
        success: false,
        message: "You cannot send gifts to yourself"
      });
    }

    const sender = await User.findOne({ username: senderUsername });
    const receiver = await User.findOne({ username: receiverUsername });

    if (!sender || !receiver) {
      return res.json({
        success: false,
        message: "User not found"
      });
    }

    if (gift.coinType === "gold") {
      if (sender.goldCoins < gift.price) {
        return res.json({
          success: false,
          message: "Not enough Gold Coins"
        });
      }

      sender.goldCoins -= gift.price;
      receiver.goldCoins += gift.price;
    }

    if (gift.coinType === "silver") {
      if (sender.silverCoins < gift.price) {
        return res.json({
          success: false,
          message: "Not enough Silver Coins"
        });
      }

      sender.silverCoins -= gift.price;
      receiver.silverCoins += gift.price;
    }

    const senderAvatar = sender.avatar || "/default-avatar.png";

    let fan = receiver.topFans.find(f => f.username === senderUsername);

    if (fan) {
      fan.amount += gift.price;
      fan.avatar = senderAvatar;
    } else {
      receiver.topFans.push({
        username: senderUsername,
        amount: gift.price,
        avatar: senderAvatar
      });
    }

    receiver.topFans.sort((a, b) => b.amount - a.amount);
    receiver.topFans = receiver.topFans.slice(0, 10);

    await sender.save();
    await receiver.save();

    if (liveRooms[receiverUsername]) {
      if (gift.coinType === "gold") {
        liveRooms[receiverUsername].goldEarned =
          (liveRooms[receiverUsername].goldEarned || 0) + gift.price;
      }

      if (gift.coinType === "silver") {
        liveRooms[receiverUsername].silverEarned =
          (liveRooms[receiverUsername].silverEarned || 0) + gift.price;
      }

      if (!liveRooms[receiverUsername].topGifters) {
        liveRooms[receiverUsername].topGifters = {};
      }

      liveRooms[receiverUsername].topGifters[senderUsername] =
        (liveRooms[receiverUsername].topGifters[senderUsername] || 0) +
        gift.price;

      const currentTopGifters = await Promise.all(
        Object.entries(liveRooms[receiverUsername].topGifters || {})
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(async ([username, amount]) => {
            const user = await User.findOne({ username });

            return {
              username,
              amount,
              avatar: user?.avatar || "/default-avatar.png"
            };
          })
      );

      io.to(receiverUsername).emit("live-gift-balance", {
        goldEarned: liveRooms[receiverUsername].goldEarned || 0,
        silverEarned: liveRooms[receiverUsername].silverEarned || 0
      });

      io.to(receiverUsername).emit("top-gifters-update", currentTopGifters);

      io.to(receiverUsername).emit("gift-received", {
        sender: senderUsername,
        gift: giftId,
        giftName: gift.name,
        emoji: gift.emoji,
        coinType: gift.coinType,
        price: gift.price
      });
    }

    res.json({
      success: true,
      message: "Gift sent successfully",
      senderBalance: {
        goldCoins: sender.goldCoins,
        silverCoins: sender.silverCoins
      },
      receiverTopFans: receiver.topFans
    });

  } catch (err) {
    console.error("SEND GIFT ERROR:", err);

    res.json({
      success: false,
      message: "Server error"
    });
  }
});

// ================= TOP FANS / HONOR WALL =================
app.get("/top-fans/:username", async (req, res) => {
  try {
    const user = await User.findOne({
      username: req.params.username
    });

    if (!user) {
      return res.json([]);
    }

    res.json(user.topFans || []);

  } catch (err) {
    console.log("TOP FANS ERROR:", err);
    res.json([]);
  }
});

app.get("/honor-wall/:username", async (req, res) => {
  try {
    const user = await User.findOne({
      username: req.params.username
    });

    if (!user) {
      return res.json({
        success: false
      });
    }

    res.json({
      success: true,
      username: user.username,
      level: user.level,
      vip: user.vip,
      diamonds: user.diamonds,
      goldCoins: user.goldCoins,
      silverCoins: user.silverCoins,
      followers: user.followers,
      following: user.following,
      visitors: user.visitors,
      topFans: user.topFans || []
    });

  } catch (err) {
    console.log("HONOR WALL ERROR:", err);
    res.json({ success: false });
  }
});

// ================= LIVE ROOMS =================
app.get("/live-rooms", (req, res) => {
  const rooms = Object.entries(liveRooms).map(([roomId, room]) => ({
    roomId,
    ...room,
    avatar: room.avatar || "/default-avatar.png",
    viewers: viewerCounts[roomId] || 0
  }));

  res.json(rooms);
});

app.get("/clear-live-rooms", (req, res) => {
  Object.keys(liveRooms).forEach(roomId => delete liveRooms[roomId]);
  Object.keys(broadcasters).forEach(roomId => delete broadcasters[roomId]);
  Object.keys(viewerCounts).forEach(roomId => delete viewerCounts[roomId]);
  Object.keys(roomViewers).forEach(roomId => delete roomViewers[roomId]);

  io.emit("live-rooms-updated");

  res.json({
    success: true,
    message: "All live rooms cleared"
  });
});

// ================= SOCKET.IO =================
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", async (roomId) => {
    socket.join(roomId);

    viewerCounts[roomId] = (viewerCounts[roomId] || 0) + 1;

    if (!roomViewers[roomId]) {
      roomViewers[roomId] = [];
    }

    const username =
      socket.handshake.query.username || `guest-${socket.id.slice(0, 4)}`;

    const user = await User.findOne({ username });

    roomViewers[roomId].push({
      socketId: socket.id,
      username,
      avatar: user?.avatar || "/default-avatar.png"
    });

    io.to(roomId).emit("viewer-count", viewerCounts[roomId]);

    io.to(roomId).emit("room-users-update", {
      users: roomViewers[roomId]
    });

    const currentTopGifters = await Promise.all(
      Object.entries(liveRooms[roomId]?.topGifters || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(async ([username, amount]) => {
          const user = await User.findOne({ username });

          return {
            username,
            amount,
            avatar: user?.avatar || "/default-avatar.png"
          };
        })
    );

    socket.emit("top-gifters-update", currentTopGifters);
  });

  socket.on("watcher", (roomId) => {
    const broadcasterId = broadcasters[roomId];

    if (!broadcasterId) {
      console.log("NO BROADCASTER FOR ROOM:", roomId);
      return;
    }

    io.to(broadcasterId).emit("watcher", socket.id);
  });

  socket.on("broadcaster", ({ roomId, streamer, avatar }) => {
    socket.join(roomId);

    broadcasters[roomId] = socket.id;

    liveRooms[roomId] = {
      roomId,
      socketId: socket.id,
      streamer,
      avatar: avatar || "/default-avatar.png",
      goldEarned: liveRooms[roomId]?.goldEarned || 0,
      silverEarned: liveRooms[roomId]?.silverEarned || 0,
      topGifters: liveRooms[roomId]?.topGifters || {}
    };

    io.emit("live-rooms-updated");

    io.to(roomId).emit("viewer-count", viewerCounts[roomId] || 0);

    io.to(roomId).emit("live-gift-balance", {
      goldEarned: liveRooms[roomId].goldEarned || 0,
      silverEarned: liveRooms[roomId].silverEarned || 0
    });

    io.to(roomId).emit("host-info", {
      streamer,
      avatar: liveRooms[roomId].avatar
    });

    socket.to(roomId).emit("broadcaster", socket.id);
  });

  socket.on("request-host-info", (roomId) => {
    if (!liveRooms[roomId]) return;

    socket.emit("host-info", {
      streamer: liveRooms[roomId].streamer,
      avatar: liveRooms[roomId].avatar
    });
  });

  socket.on("offer", (viewerId, offer) => {
    io.to(viewerId).emit("offer", socket.id, offer);
  });

  socket.on("answer", (broadcasterId, answer) => {
    io.to(broadcasterId).emit("answer", socket.id, answer);
  });

  socket.on("ice-candidate", (targetId, candidate) => {
    if (!targetId || !candidate) return;

    io.to(targetId).emit("ice-candidate", socket.id, candidate);
  });

  socket.on("chat-message", (data) => {
    io.to(data.roomId).emit("chat-message", data);
  });

  socket.on("stop-live", (roomId) => {
    delete liveRooms[roomId];
    delete broadcasters[roomId];
    delete viewerCounts[roomId];
    delete roomViewers[roomId];

    io.emit("live-rooms-updated");
  });

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;

      if (broadcasters[roomId] === socket.id) {
        delete broadcasters[roomId];
        delete liveRooms[roomId];
        delete viewerCounts[roomId];
        delete roomViewers[roomId];

        io.emit("live-rooms-updated");
      } else {
        viewerCounts[roomId] =
          Math.max((viewerCounts[roomId] || 1) - 1, 0);

        io.to(roomId).emit("viewer-count", viewerCounts[roomId]);

        if (roomViewers[roomId]) {
          roomViewers[roomId] = roomViewers[roomId].filter(
            user => user.socketId !== socket.id
          );

          io.to(roomId).emit("room-users-update", {
            users: roomViewers[roomId]
          });
        }
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// ================= START SERVER =================
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});