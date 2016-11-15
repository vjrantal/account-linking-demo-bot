var restify = require('restify');
var builder = require('botbuilder');
var request = require('request');

var FRONTEND_URL = process.env.BOT_FRONTEND_URL || 'https://localhost';

var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
  console.log('%s listening to %s', server.name, server.url);
});

var connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

var bot = new builder.UniversalBot(connector);

server.post('/api/messages', connector.listen());

server.get('/authorize', restify.queryParser(), function (req, res, next) {
  if (req.query && req.query.redirect_uri && req.query.username) {
    var username = req.query.username;

    // Here, it would be possible to take username (and perhaps password and other data)
    // and do some verifications with a backend system. The authorization_code query string
    // argument is an arbitrary pass-through value that could be stored as well
    // to enable verifying it once Facebook sends the `Account Linking webhook event`
    // that we handle below. In this case, we are passing the username via the authorization_code
    // since that avoids a need for an external databases in this simple scenario.

    var redirectUri = req.query.redirect_uri + '&authorization_code=' + username;
    return res.redirect(redirectUri, next);
  } else {
    return res.send(400, 'Request did not contain redirect_uri and username in the query string');
  }
});

server.get(/\/static\/?.*/, restify.serveStatic({
  directory: __dirname
}));

var intents = new builder.IntentDialog();
bot.dialog('/', intents);

intents.onDefault(function (session) {
  var accountLinking = session.message.sourceEvent.account_linking;
  if (accountLinking) {
    // This is the handling for the `Account Linking webhook event` where we could
    // verify the authorization_code and that the linking was successful.
    // The authorization_code is the value we passed above and
    // status has value `linked` in case the linking succeeded.
    var username = accountLinking.authorization_code;
    var authorizationStatus = accountLinking.status;
    if (authorizationStatus === 'linked') {
      session.endDialog('Account linked - you are now known as: ' + username);
    } else if (authorizationStatus === 'unlinked') {
      session.endDialog('Account unlinked');
    } else {
      session.endDialog('Unknown account linking event received');
    }
  } else {
    session.endDialog('I hear you - type "link account" to try out account linking');
  }
});

intents.matches(/^link account/i,
  function (session) {
    var message = new builder.Message(session)
      .sourceEvent({
        facebook: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: [{
                title: 'Welcome to Account Linking',
                image_url: FRONTEND_URL + '/static/linking.png',
                buttons: [{
                  type: 'account_link',
                  url: FRONTEND_URL + '/static/index.html'
                }]
              }]
            }
          }
        }
      });
    session.endDialog(message);
  }
);

intents.matches(/^unlink account/i,
  function (session) {
    request({
      url: 'https://graph.facebook.com/v2.6/me/unlink_accounts',
      method: 'POST',
      qs: {
        access_token: process.env.FACEBOOK_PAGE_TOKEN
      },
      body: {
        psid: session.message.address.user.id
      },
      json: true
    }, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        // No need to do anything send anything to the user
        // in the success case since we respond only after
        // we have received the account unlinking webhook
        // event from Facebook.
        session.endDialog();
      } else {
        session.endDialog('Error while unlinking account');
      }
    });
  }
);
