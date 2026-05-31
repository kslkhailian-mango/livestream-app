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

let users = [];

app.post("/register", (req, res) => {
    const { username, password } = req.body;

    users.push({
        username,
        password
    });

    res.json({
        success: true,
        message: "Registered"
    });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    const user = users.find(
        u => u.username === username && u.password === password
    );

    if(user){
        req.session.user = user;
        res.json({ success:true });
    } else {
        res.json({ success:false });
    }
});

let viewerCount = 0;

io.on("connection", (socket) => {
    viewerCount++;

    io.emit("viewer-count", viewerCount);

    socket.on("chat-message", (data) => {
        io.emit("chat-message", data);
    });

    socket.on("disconnect", () => {
        viewerCount--;
        io.emit("viewer-count", viewerCount);
    });
});
const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});