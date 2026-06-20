function goHostProfile() {
    const room = roomId;

    if (!room) {
        alert("Host not found");
        return;
    }

    window.location.href =
        `/profile.html?username=${encodeURIComponent(room)}`;
}