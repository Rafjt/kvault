const express = require('express');
const app = express();
const PORT = 2111;
router = require('./routes/api')
const auth = require('./routes/auth');

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Server is running, everything’s ok');
});

app.use('/api',router)
app.use('/auth', auth);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
