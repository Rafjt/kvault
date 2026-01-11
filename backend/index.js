const express = require('express');
const app = express();
const PORT = 2111;
router = require('./routes/api')
const auth = require('./routes/auth');
const cookieParser = require('cookie-parser');
const cors = require('cors');

app.use(express.json());
// Allow requests from the frontend dev server and enable cookies
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));

app.get('/', (req, res) => {
    res.send('Server is running, everything’s ok');
});
app.use(cookieParser());

app.use('/api',router)
app.use('/auth', auth);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
