const express = require("express");
const S3 = require('aws-sdk/clients/s3');

const app = express();

if (!process.env.PORT) {
    throw new Error("Please specify the port number for the HTTP server with the environment variable PORT.");
}

if (!process.env.AWS_ACCESS_KEY_ID) {
  throw new Error("Please specify the access key to an AWS S3 account in environment variable AWS_ACCESS_KEY_ID.");
}

if (!process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("Please specify the secret access key to an AWS S3 account in environment variable AWS_SECRET_ACCESS_KEY.");
}

if (!process.env.S3_BUCKET_NAME) {
  throw new Error("Please specify the S3 bucket name in environment variable S3_BUCKET_NAME.");
}

const PORT = process.env.PORT;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

app.get("/video", (req, res) => {
    const videoPath = `videos/${req.query.path}`;
    console.log(`Streaming video from path ${videoPath}`);

    const s3 = new S3();
    s3.getObject({ Bucket: S3_BUCKET_NAME, Key: videoPath }, function(err, data) {
      if (err) {
        console.error(`Error occurred getting properties for video ${S3_BUCKET_NAME}/${videoPath}.`);
        console.error(err && err.stack || err);
        res.sendStatus(500);
        return;
      }
    }).on('httpHeaders', function (statusCode, headers) {
      res.set('Content-Length', headers['content-length']);
      res.set('Content-Type', headers['content-type']);
      this.response.httpResponse.createUnbufferedStream()
          .pipe(res);
    })
    .send();
});

app.listen(PORT, () => {
  console.log(`Video storage microservice online at port ${PORT}`);
});
