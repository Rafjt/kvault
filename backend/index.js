const express = require('express');
const app = express();
app.set('trust proxy', 1);
const PORT = 2111;
router = require('./routes/api')
const auth = require('./routes/auth');
const cookieParser = require('cookie-parser');
const cors = require('cors');

app.use(express.json());
// Allow requests from the frontend dev server and enable cookies
// app.use(cors({
//   origin: 'http://kvault.local',
//   credentials: true
// }));


app.get('/', (req, res) => {
    res.send('Server is running, everything’s ok');
});
app.use(cookieParser());

app.use('/api',router)
app.use('/auth', auth);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

