const express = require('express');
const fs = require('fs');

const app = express();

if (!process.env.PORT) {
  throw new Error('PORT env variable not defined');
}

const PORT = process.env.PORT;

app.get('/video', (req, res) => {
  const path = './SampleVideo_1280x720_1mb.mp4';
  fs.stat(path, (err, stats) => {
    if (err) {
      console.error('Could not load video', err.message);
      res.sendStatus(500);
      return;
    }

    res.writeHead(200, {
      "Content-Length": stats.size,
      "Content-Type": "video/mp4",
    });

    fs.createReadStream(path).pipe(res);
  });
});

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, () => {
  console.log(`Video streaming microservice online at port ${PORT}`);
});