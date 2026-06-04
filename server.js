const mongoose = require("mongoose");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
mongoose.connect("mongodb+srv://PenglamFoundation:Zammun%40123@cluster0.d3tgnwk.mongodb.net/test?retryWrites=true&w=majority")
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));

const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.json());

app.use(session({
    secret: "livestream-secret",
    resave: false,
    saveUninitialized: true
}));

app.use(express.static("public"));
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/home.html");
});
const userSchema = new mongoose.Schema({
    username: String,
    password: String,

    avatar: {
        type: String,
        default: "/default-avatar.png"
    },

    followers: {
        type: Number,
        default: 0
    },

    following: {
        type: Number,
        default: 0
    },

    coins: {
        type: Number,
        default: 0
    },

    bio: {
        type: String,
        default: ""
    }
});
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));
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
const User = mongoose.model("User", userSchema);

app.post("/upload-avatar", upload.single("avatar"), async (req, res) => {
    try {
        const { username } = req.body;

        if (!req.file) {
            return res.json({ success: false, message: "No file uploaded" });
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
        console.log("UPLOAD ERROR:", err);
        res.status(500).json({ success: false });
    }
});

app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    const user = new User({
        username,
        password
    });

    await user.save();

    res.json({
        success: true,
        message: "Registered"
    });
});
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username, password });

  if (user) {
    req.session.user = user;
    res.json({ success: true, username: user.username });
  } else {
    res.json({ success: false });
  }
});
app.get("/profile/:username", async (req, res) => {

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
  avatar: user.avatar,
  followers: user.followers,
  following: user.following,
  coins: user.coins,
  bio: user.bio
 });
});
async function followHandler(req, res) {
  try {
    const username = req.params.username;

    let user = await User.findOne({ username });

    if (!user) {
      user = new User({
        username: username,
        password: "1234",
        followers: 0,
        following: 0,
        coins: 0
      });
    }

    user.followers = (user.followers || 0) + 1;

    await user.save();

    res.json({
      success: true,
      followers: user.followers
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
}

app.post("/follow/:username", followHandler);
app.get("/follow/:username", followHandler);

app.post("/unfollow/:username", async (req, res) => {
  try {
    const username = req.params.username;

    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false });
    }

    if (user.followers > 0) {
      user.followers -= 1;
    }

    await user.save();

    res.json({
      success: true,
      followers: user.followers
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
});  
app.post("/update-profile/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const { avatar, bio } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false });
    }

    if (avatar) user.avatar = avatar;
    if (bio) user.bio = bio;

    await user.save();

    res.json({
      success: true,
      avatar: user.avatar,
      bio: user.bio
    });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }  
});
app.post("/add-coins/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const { amount } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false });
    }

    user.coins += Number(amount);

    await user.save();

    res.json({
      success: true,
      coins: user.coins
    });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }
});  
app.post("/send-gift/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const { amount, giftName } = req.body;

    const user = await User.findOne({ username });

    if (!user) {
      return res.json({ success: false });
    }

    user.coins += Number(amount);
    await user.save();

    io.emit("gift-received", {
      username,
      giftName,
      amount,
      coins: user.coins
    });

    res.json({
      success: true,
      coins: user.coins
    });

  } catch (err) {
    console.log(err);
    res.json({ success: false });
  }  
});
app.get("/follow/:username", followHandler);
app.post("/follow/:username", followHandler);

const broadcasters = {};
const viewerCounts = {};
const liveRooms = {};
app.get("/live-rooms", (req, res) => {
  const rooms = Object.values(liveRooms).map(room => ({
    ...room,
    viewers: viewerCounts[room.roomId] || 0
  }));

  res.json(rooms);
});  
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
socket.on("join-room", (roomId) => {

   console.log("JOIN ROOM:", roomId);
   
     liveRooms[roomId] = {
     roomId: roomId,
     title: "Live Stream",
     streamer: "test1"
  };
    socket.join(roomId);

    viewerCounts[roomId] =
        (viewerCounts[roomId] || 0) + 1;

    console.log("VIEWERS:", viewerCounts[roomId]);

    io.to(roomId).emit(
        "viewer-count",
        viewerCounts[roomId]
    );
});
socket.on("watcher", (roomId) => {
  console.log("WATCHER:", roomId, socket.id);

  const broadcasterId = broadcasters[roomId];

  if (broadcasterId) {
    io.to(broadcasterId).emit("watcher", socket.id);
  }
});

socket.on("offer", (viewerId, offer) => {
  io.to(viewerId).emit("offer", offer);
});

socket.on("answer", (broadcasterId, answer) => {
  io.to(broadcasterId).emit("answer", socket.id, answer);
});

socket.on("ice-candidate", (targetId, candidate) => {
    io.to(targetId).emit(
        "ice-candidate",
        socket.id,
        candidate
    );
});
  socket.on("broadcaster", (data) => {
  const roomId = data.roomId;
  const streamer = data.streamer || "Guest";
  broadcasters[roomId] = socket.id;
  liveRooms[roomId] = {
  roomId,
  title: streamer + " Live",
  streamer,
  avatar: data.avatar || "/default-avatar.png"
};
  io.emit("live-rooms-updated");
});

  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
     
        if (roomId !== socket.id) {

            viewerCounts[roomId] =
                Math.max((viewerCounts[roomId] || 1) - 1, 0);

            io.to(roomId).emit(
                "viewer-count",
                viewerCounts[roomId]
            );
        if (liveRooms[roomId]) {
               delete liveRooms[roomId];
                io.emit("live-rooms-updated");
           }
            console.log(
                "VIEWERS:",
                viewerCounts[roomId]
            );
        }
    }

    console.log("User disconnected:", socket.id);
});
});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});