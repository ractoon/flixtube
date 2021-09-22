const express = require('express');
const mongodb = require('mongodb');
const bodyParser = require('body-parser');
const amqp = require('amqplib');

if (!process.env.DBHOST) {
  throw new Error("Please specify the databse host using environment variable DBHOST.");
}

if (!process.env.DBNAME) {
  throw new Error("Please specify the name of the database using environment variable DBNAME");
}

if (!process.env.RABBIT) {
  throw new Error("Please specify the name of the RabbitMQ host using environment variable RABBIT");
}

const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;
const RABBIT = process.env.RABBIT;

function connectDb() {
  return mongodb.MongoClient.connect(DBHOST)
      .then(client => {
          return client.db(DBNAME);
      });
}

function connectRabbit() {
  console.log(`Connecting to RabbitMQ server at ${RABBIT}.`);

  return amqp.connect(RABBIT)
      .then(messagingConnection => {
          console.log("Connected to RabbitMQ.");
          return messagingConnection.createChannel();
      });
}

function setupHandlers(app, db, messageChannel) {
  const videosCollection = db.collection('videos');

  app.get('/history', (req, res) => {
    const skip = parseInt(req.query.skip);
    const limit = parseInt(req.query.limit);
    videosCollection.find()
        .skip(skip)
        .limit(limit)
        .toArray()
        .then(documents => {
            res.json({ history: documents });
        })
        .catch(err => {
            console.error(`Error retrieving history from database.`);
            console.error(err && err.stack || err);
            res.sendStatus(500);
        });
  });

  function consumeViewedMessage(msg) { // Handler for coming messages.
    console.log("Received a 'viewed' message");

    const parsedMsg = JSON.parse(msg.content.toString());
    return videosCollection.insertOne({ videoPath: parsedMsg.videoPath })
        .then(() => {
            console.log("Acknowledging message was handled.");
            messageChannel.ack(msg);
        });
  };

  return messageChannel.assertQueue('viewed', {})
      .then(() => {
          console.log("Asserted that the 'viewed' queue exists.");
          return messageChannel.consume('viewed', consumeViewedMessage);
      });
}

function startHttpServer(db, messageChannel) {
  return new Promise(resolve => {
      const app = express();
      app.use(bodyParser.json());
      setupHandlers(app, db, messageChannel);

      const port = process.env.PORT && parseInt(process.env.PORT) || 3000;
      app.listen(port, () => {
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
  .then(() => console.log('Microservice online.'))
  .catch(err => {
    console.error('Microservice failed to start.');
    console.error(err && err.stack || err);
  });