const express = require("express");
const app = express();
const router = express.Router();
const sequelize = require("../database");
const {authMiddleware} = require("../middleware/auth.middleware.js")

router.get('/about', (req, res) => {
    res.send('About this app');
});

router.get("/check", authMiddleware, (req, res) => {
  return res.status(200).json({ status: "OK" });
});


module.exports = router;