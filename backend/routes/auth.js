const express = require("express");
const sequelize = require("../database");
const router = express.Router();

router.get('/about', (req, res) => {
    res.send('About the auth');
});

module.exports = router;