/* eslint-disable strict */
const WebSocket = require('ws');
let models = require('./server.js').models;

const ws = new WebSocket.Server({port: 8085});

ws.on('connection', (ws) => {
  function login(email, password) {
    models.User.login({email, password}, (err, result) => {
      if (err) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          error: err,
        }));
      } else {
        models.User.findOne(
          {where: {id: result.userId}, include: 'Profile'},
          (err, user) => {
            if (err) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                error: err,
              }));
            } else {
              ws.send(JSON.stringify({
                type: 'LOGGEDIN',
                data: {
                  session: result,
                  user: user,
                },
              }));
            }
          }
        );
      }
    });
  };
  console.log('Connection open');
  ws.on('message', (message) => {
    try {
      let requestJson = JSON.parse(message);
      console.log('Got message', JSON.parse(message));
      if (requestJson) {
        switch (requestJson.type) {
          case 'SIGNUP':
            models.User.create(requestJson.data, (err, user) => {
              if (err) {
                ws.send(JSON.stringify({
                  type: 'ERROR',
                  error: err,
                }));
              } else {
                models.Profile.create({
                  userId: user.id,
                  name: requestJson.data.name,
                  email: requestJson.data.email,
                }, (err, profile) => {
                  if (err) {
                    ws.send(JSON.stringify({
                      type: 'ERROR',
                      error: err,
                    }));
                  } else {
                    login(requestJson.data.email, requestJson.data.password);
                  }
                });
              }
            });
            break;
          case 'LOGIN':
            login(requestJson.data.email, requestJson.data.password);
          default:
            break;
        }
      };
    } catch (err) {
      console.log(err);
    };
  });
});
