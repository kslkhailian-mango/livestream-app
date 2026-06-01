const mongoose = require("mongoose");
mongoose.connect("mongodb+srv://PenglamFoundation:Zammun%40123@cluster0.d3tgnwk.mongodb.net/?appName=Cluster0")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));
const express = require("express");
const session = require("express-session");

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
const userSchema = new mongoose.Schema({
  username: String,
  password: String
});

const User = mongoose.model("User", userSchema);

let broadcaster = null;

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

let viewerCount = 0;

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    viewerCount++;
    io.emit("viewer-count", viewerCount);

    socket.on("broadcaster", () => {
        broadcaster = socket.id;
        socket.broadcast.emit("broadcaster");
    });

    socket.on("watcher", () => {
        if (broadcaster) {
            io.to(broadcaster).emit("watcher", socket.id);
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
        io.emit("chat-message", data);
    });

    socket.on("disconnect", () => {
        viewerCount--;
        io.emit("viewer-count", viewerCount);

        socket.to(broadcaster).emit("disconnectPeer", socket.id);

        if (socket.id === broadcaster) {
            broadcaster = null;
            socket.broadcast.emit("broadcaster-disconnected");
        }
    });
});

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});