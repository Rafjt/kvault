const express = require("express");
const app = express();
const router = express.Router();
const sequelize = require("../database");

router.get('/about', (req, res) => {
    res.send('About this app');
});


module.exports = router;