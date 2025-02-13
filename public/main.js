/**
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

// Initializes the SmartHome.
function SmartHome() {
  document.addEventListener('DOMContentLoaded', function () {
    // Shortcuts to DOM Elements.
    this.denyButton = document.getElementById('demo-deny-button');
    this.userWelcome = document.getElementById('user-welcome');

    // Bind events.
    this.updateButton = document.getElementById('demo-washer-update');
    this.updateButton.addEventListener('click', this.updateState.bind(this));
    this.washer = document.getElementById('demo-washer');
    this.requestSync = document.getElementById('request-sync');
    this.requestSync.addEventListener('click', async () => {
      try {
        const response = await fetch('/request-sync?agentUserId=agentId-7c9ed23f');
        console.log(response.status == 200 ?
          'Request SYNC success!' : `Request SYNC unexpected status: ${response.status}`);
      } catch (err) {
        console.error('Request SYNC error', err);
      }
    });

    this.initFirebase();
    this.initWasher();
  }.bind(this));
}

SmartHome.prototype.initFirebase = () => {
  // Initiates Firebase.
  console.log("Initialized Firebase");
};

SmartHome.prototype.initWasher = () => {
  console.log("Logged in as default user");
  this.uid = "Timmatt";
  this.smarthome.userWelcome.innerHTML = "Welcome user Timmatt!";

  this.smarthome.handleData();
  this.smarthome.washer.style.display = "block";
}

SmartHome.prototype.setToken = (token) => {
  document.cookie = '__session=' + token + ';max-age=3600';
};

SmartHome.prototype.handleData = () => {
  const uid = this.uid;
  const elOnOff = document.getElementById('demo-washer-onOff');
  const elRunCycle = document.getElementById('demo-washer-runCycle');
  const elStartStopPaused = document.getElementById('demo-washer-startStopPaused');
  const elStartStopRunning = document.getElementById('demo-washer-startStopRunning');

  firebase.database().ref('/').child('userDevices').child('washer-1c7d0be3').on("value", (snapshot) => {
    if (snapshot.exists()) {
      const washerState = snapshot.val();
      console.log(washerState)

      if (washerState.isOn) elOnOff.MaterialSwitch.on();
      else elOnOff.MaterialSwitch.off();

      if (washerState.runCycle.isDummy) elRunCycle.MaterialSwitch.on();
      else elRunCycle.MaterialSwitch.off();

      if (washerState.isPaused) elStartStopPaused.MaterialSwitch.on();
      else elStartStopPaused.MaterialSwitch.off();

      if (washerState.isRunning) elStartStopRunning.MaterialSwitch.on();
      else elStartStopRunning.MaterialSwitch.off();

    }
  })
}

SmartHome.prototype.updateState = () => {
  const elOnOff = document.getElementById('demo-washer-onOff');
  const elRunCycle = document.getElementById('demo-washer-runCycle');
  const elStartStopPaused = document.getElementById('demo-washer-startStopPaused');
  const elStartStopRunning = document.getElementById('demo-washer-startStopRunning');

  const pkg = {
    isOn: elOnOff.classList.contains('is-checked'),
    runCycle: { isDummy: elRunCycle.classList.contains('is-checked') },
    isPaused: elStartStopPaused.classList.contains('is-checked'),
    isRunning: elStartStopRunning.classList.contains('is-checked'),
    userId: 'eca2f3e3',
  };


  console.log(pkg);
  firebase.database().ref('/').child('userDevices').child('washer-1c7d0be3').update(pkg);
}

// Load the SmartHome.
window.smarthome = new SmartHome();
