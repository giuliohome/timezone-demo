const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint that returns server time (for comparison)
app.get('/api/server-time', (req, res) => {
  const now = new Date();
  res.json({
    serverTime: now.toISOString(),
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    serverOffset: now.getTimezoneOffset()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Demo app running on http://localhost:${PORT}`);
  console.log(`Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  console.log(`Server time: ${new Date().toISOString()}`);
});