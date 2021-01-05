/* eslint-disable max-len */
/* eslint-disable strict */
const WebSocket = require('ws');
let models = require('./server.js').models;

const ws = new WebSocket.Server({port: 8085});
let clients = [];

ws.on('connection', (ws) => {
  function handleError(error) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: error,
    }));
  };
  function handleUnexpectedError(errorCode = 0) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      error: {
        message: 'Unexpected Error, please contact the support',
        errorCode,
      },
    }));
  }
  function getInitialThreads(userId) {
    // Input: user ID as a string.
    models.Thread.find({where: {
      users: {like: userId.toString()},
    }}, (error, threads) => {
      if (error) {
        handleError(error);
      } else if (threads) {
        console.log(threads);
        ws.send(JSON.stringify({
          type: 'INITIAL_THREADS',
          data: threads,
        }));
      } else {
        handleUnexpectedError();
      }
    });
  };
  function login(email, password) {
    models.User.login({email, password}, (err, result) => {
      if (err) {
        ws.send(JSON.stringify({
          type: 'ERROR',
          error: err,
        }));
      } else {
        models.User.findOne(
          {where: {id: result.userId}},
          (err, user) => {
            if (err) {
              ws.send(JSON.stringify({
                type: 'ERROR',
                error: err,
              }));
            } else {
              ws.uid = user.id + new Date().getTime().toString();
              const userObject = {
                id: user.id,
                email: user.email,
                ws,
              };
              // ToDo: User logout function should clean its tail in the server.
              // This is to prevent multiple client instances in login. Remove when handled properly.
              clients = clients.filter(C => C.id.toString() !== user.id.toString());
              clients.push(userObject);
              console.log('current clients: ', clients, typeof(user.id));
              ws.send(JSON.stringify({
                type: 'LOGGEDIN',
                data: {
                  session: result,
                  user: user,
                },
              }));
              getInitialThreads(user.id);
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
            break;
          case 'CONNECT_WITH_TOKEN':
            // Check the access token and userId's validity and send user data to client.
            models.AccessToken.findById(requestJson.data.token, (error, accessToken) => {
              if (error) {
                console.log(error.message);
                ws.send(JSON.stringify({
                  type: 'ERROR',
                  message: error.message,
                }));
              } else if (accessToken) {
                if (accessToken.userId.toString() === requestJson.data.userId) {
                  // Check if user is already logged in.
                  var userObject = clients.filter(U => (U.id.toString() === accessToken.userId.toString()));
                  if (userObject.length > 0) {
                    userObject = userObject[0];
                  } else {
                    // If not, create one.
                    models.User.findById(requestJson.data.userId, (error2, user) => {
                      if (error2) {
                        console.log(error.message);
                        ws.send(JSON.stringify({
                          type: 'ERROR',
                          message: error.message,
                        }));
                      } else if (user) {
                        ws.uid = user.id + new Date().getTime().toString();
                        userObject = {
                          id: user.id,
                          email: user.email,
                          ws,
                        };
                        getInitialThreads(user.id);
                        clients.push(userObject);
                        console.log('current clients: ', clients);
                        ws.send(JSON.stringify({
                          type: 'LOGGEDIN',
                          data: {
                            session: accessToken,
                            user: user,
                          },
                        }));
                      }
                    });
                  };
                };
              } else {
                console.log('unidentified error, No user found');
              }
            });
            break;
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
            models.Thread.findOne({where: {
              and: [
                {users: {like: requestJson.data[0]}},
                {users: {like: requestJson.data[1]}},
              ],
            }}, (err, thread) => {
              if (!err, thread) {
                // To Do: complete user login function and then remove this!
                clients.filter(u => thread.users.indexOf(u.id.toString()) > -1).map(client => {
                  client.ws.send(JSON.stringify({
                    type: 'ADD_THREAD',
                    data: thread,
                  }));
                });
              } else if (err) {
                ws.send(JSON.stringify({
                  type: 'ERROR',
                  message: err.message,
                }));
              } else {
                models.Thread.create({
                  lastUpdated: new Date(),
                  users: requestJson.data,
                }, (err2, thread) => {
                  if (!err2 && thread) {
                    clients.filter(u => thread.users.indexOf(u.id.toString()) > -1).map(client => {
                      client.ws.send(JSON.stringify({
                        type: 'ADD_THREAD',
                        data: thread,
                      }));
                    });
                  } else if (err2) {
                    ws.send(JSON.stringify({
                      type: 'ERROR',
                      message: err2.message,
                    }));
                  }
                });
              }
            });
            break;
          case 'THREAD_LOAD':
            break;
          default:
            break;
        }
      };
    } catch (err) {
      console.log(err);
    };
  }); // ws.on('message');
});
