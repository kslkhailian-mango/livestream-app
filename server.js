const mongoose = require("mongoose");
const express = require("express");
const session = require("express-session");

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
        default: "/MMGPENGLAM1.png"
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

const User = mongoose.model("User", userSchema);

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

    const user = await User.findOne({
        username,
        password
    });

    if (user) {
        req.session.user = user;
        res.json({ success: true });
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
        user
    });

});
async function followHandler(req, res) {
    const user = await User.findOne({
        username: req.params.username
    });

    if (!user) {
        return res.json({ success: false });
    }

    user.followers += 1;
    await user.save();

    res.json({
        success: true,
        followers: user.followers
    });
}
app.post("/unfollow/:username", async (req, res) => {

    const user = await User.findOne({
        username: req.params.username
    });

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
        socket.join(roomId);

        if (!viewerCounts[roomId]) {
            viewerCounts[roomId] = 0;
        }

        viewerCounts[roomId]++;
        io.to(roomId).emit("viewer-count", viewerCounts[roomId]);
    });

socket.on("broadcaster", (roomId) => {
    broadcasters[roomId] = socket.id;
    socket.join(roomId);

    liveRooms[roomId] = {
        roomId,
        title: roomId,
        startedAt: new Date()
    };

    socket.to(roomId).emit("broadcaster");
    io.emit("live-rooms-updated");
});

    socket.on("watcher", (roomId) => {
        socket.join(roomId);

        if (broadcasters[roomId]) {
            io.to(broadcasters[roomId]).emit("watcher", socket.id);
        }
    });

    socket.on("offer", (id, message) => {
        io.to(id).emit("offer", socket.id, message);
    });

    socket.on("answer", (id, message) => {
        io.to(id).emit("answer", socket.id, message);
    });

    socket.on("candidate", (id, message) => {
        io.to(id).emit("candidate", socket.id, message);
    });

    socket.on("chat-message", (data) => {
        io.to(data.roomId).emit("chat-message", data);
    });

    socket.on("disconnect", () => {
        for (const roomId of socket.rooms) {
            if (roomId !== socket.id && viewerCounts[roomId]) {
                viewerCounts[roomId]--;
                io.to(roomId).emit("viewer-count", viewerCounts[roomId]);
            }

            if (broadcasters[roomId] === socket.id) {
    delete broadcasters[roomId];
    delete liveRooms[roomId];
    socket.to(roomId).emit("broadcaster-disconnected");
    io.emit("live-rooms-updated");
}
        }

        for (const roomId in broadcasters) {
            io.to(broadcasters[roomId]).emit("disconnectPeer", socket.id);
        }

        console.log("User disconnected:", socket.id);
    });
socket.on("chat-message", data => {
    io.emit("chat-message", data);
});    
});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});