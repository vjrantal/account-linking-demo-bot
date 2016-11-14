window.continueClicked = function () {
  var username = document.getElementById('usernameInput').value;
  var newLocation = '/authorize' + window.location.search;
  if (window.location.search) {
    newLocation += '&';
  } else {
    newLocation += '?';
  }
  window.location = newLocation + 'username=' + username;
};
