/* eslint-disable max-len */
/* eslint-disable strict */
const WebSocket = require('ws');
let models = require('./server.js').models;

const ws = new WebSocket.Server({port: 8085});
const clients = [];

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
              const userObject = {
                id: user.id,
                email: user.email,
                ws,
              };
              clients.push(userObject);
              console.log('current clients: ', clients);
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
          case 'SEARCH':
            const keyword = requestJson.data.keyword;
            models.User.find({where: {email: {like: keyword}}}, (error, result) => {
              if (!error && result) {
                ws.send(JSON.stringify({
                  type: 'SEARCH_RESULTS',
                  data: result,
                }));
              } else {
                console.log(error.message);
                ws.send(JSON.stringify({
                  type: 'ERROR',
                  message: error.message,
                }));
              };
            });
            break;
          case 'FIND_THREAD':
            models.Thread.find({where: {
              and: [
                {users: {like: requestJson.data[0]}},
                {users: {like: requestJson.data[1]}},
              ],
            },
            }, (err, thread) => {
              if (!err && thread) {
                ws.send(JSON.stringify({
                  type: 'ADD_THREAD',
                  data: thread,
                }));
              } else if (err) {
                ws.send(JSON.stringify({
                  type: 'ERROR',
                  message: err.message,
                }));
              } else {
                ws.send(JSON.stringify({
                  type: 'ERROR',
                  message: 'Unidentifeid Error, please check the server logs',
                }));
              }
            });
            break;
          default:
            break;
        }
      };
    } catch (err) {
      console.log(err);
    };
  });
});
