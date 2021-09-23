const express = require('express');
const http = require('http');
const mongodb = require('mongodb');
const amqp = require('amqplib');

const app = express();

if (!process.env.PORT) {
  throw new Error("Please specify the port number for the HTTP server with the environment variable PORT.");
}

if (!process.env.DBHOST) {
  throw new Error("Please specify the databse host using environment variable DBHOST.");
}

if (!process.env.DBNAME) {
  throw new Error("Please specify the name of the database using environment variable DBNAME");
}

if (!process.env.VIDEO_STORAGE_HOST) {
  throw new Error("Please specify the host name for the video storage microservice in variable VIDEO_STORAGE_HOST.");
}

if (!process.env.VIDEO_STORAGE_PORT) {
  throw new Error("Please specify the port number for the video storage microservice in variable VIDEO_STORAGE_PORT.");
}

if (!process.env.RABBIT) {
  throw new Error("Please specify the name of the RabbitMQ host using environment variable RABBIT");
}

const PORT = process.env.PORT;
const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;
const VIDEO_STORAGE_HOST = process.env.VIDEO_STORAGE_HOST;
const VIDEO_STORAGE_PORT = parseInt(process.env.VIDEO_STORAGE_PORT);
const RABBIT = process.env.RABBIT;
console.log(`Forwarding video requests to ${VIDEO_STORAGE_HOST}:${VIDEO_STORAGE_PORT}.`);

function connectDb() {
  return mongodb.MongoClient.connect(DBHOST)
      .then(client => {
          return client.db(DBNAME);
      });
}

function connectRabbit() {
  console.log(`Connecting to RabbitMQ server at ${RABBIT}.`);

  return amqp.connect(RABBIT)
      .then(connection => {
          console.log("Connected to RabbitMQ.");
          return connection.createChannel()
              .then(messageChannel => {
                return messageChannel.assertExchange('viewed', 'fanout')
                  .then(() => {
                    return messageChannel;
                  })
              });
      });
}

function sendViewedMessage(messageChannel, videoPath) {
  const msg = { videoPath: videoPath };
  const jsonMsg = JSON.stringify(msg);
  messageChannel.publish('viewed', '', Buffer.from(jsonMsg));
}

function setupHandlers(app, db, messageChannel) {
  app.get('/video', (req, res) => {
    const videoId = new mongodb.ObjectID(req.query.id);
    const videosCollection = db.collection('videos');
    videosCollection.findOne({ _id: videoId })
        .then(videoRecord => {
          if (!videoRecord) {
              res.sendStatus(404);
              return;
          }

          console.log(`Translated id ${videoId} to path ${videoRecord.videoPath}.`);

          const forwardRequest = http.request(
            {
              host: VIDEO_STORAGE_HOST,
              port: VIDEO_STORAGE_PORT,
              path:`/video?path=${videoRecord.videoPath}`,
              method: 'GET',
              headers: req.headers
            },
            forwardResponse => {
              res.writeHeader(forwardResponse.statusCode, forwardResponse.headers);
                forwardResponse.pipe(res);
            }
          );

          req.pipe(forwardRequest);
          sendViewedMessage(messageChannel, videoRecord.videoPath);
        })
        .catch(err => {
          console.error("Database query failed.");
          console.error(err && err.stack || err);
          res.sendStatus(500);
        });
  });
}

app.get('/', (req, res) => {
  res.send('Hello World!');
});

function startHttpServer(db, messageChannel) {
  return new Promise(resolve => {
      const app = express();
      setupHandlers(app, db, messageChannel);

      const port = process.env.PORT && parseInt(process.env.PORT) || 3000;
      app.listen(port, () => {
        console.log(`Microservice listening, please load the data file db-fixture/videos.json into your database before testing this microservice.`);
        resolve();
      });
  });
}

function main() {
  return connectDb(DBHOST)
        .then(db => {
          return connectRabbit()
              .then(messageChannel => {
                  return startHttpServer(db, messageChannel);
              });
        });
}

main()
    .then(() => console.log("Microservice online."))
    .catch(err => {
        console.error("Microservice failed to start.");
        console.error(err && err.stack || err);
    });