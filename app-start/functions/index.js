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

const functions = require('firebase-functions');
const {smarthome} = require('actions-on-google');
const {google} = require('googleapis');
const util = require('util');
const admin = require('firebase-admin');
const {randomUUID} = require('crypto');
const assert = require('assert');
// Initialize Firebase
admin.initializeApp();
const firebaseRef = admin.database().ref('/');
// Initialize Homegraph
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/homegraph'],
});
const homegraph = google.homegraph({
  version: 'v1',
  auth: auth,
});

exports.login = functions.https.onRequest((request, response) => {
  if (request.method === 'GET') {
    functions.logger.log('Requesting login page');
    response.send(`
    <html>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <body>
        <form action="/login" method="post">
          <input type="hidden"
            name="responseurl" value="${request.query.responseurl}" />
          <input type="radio" id="userIdTimmatt" name="userId" 
            value="Timmatt" checked>
          <label for="userIdTimmatt">Timmatt</label><br>
          <input type="radio" id="userIdJohn" name="userId" value="John">
          <label for="userIdJohn">John</label><br>
          <input type="radio" id="userIdMT" name="userId" value="MT">
          <label for="userIdMT">MT</label><br>
          <button type="submit">
            Link this service to Google
          </button>
        </form>
      </body>
    </html>
  `);
  } else if (request.method === 'POST') {
    // Here, you should validate the user account.
    // In this sample, we do not do that.
    // HACK: 我先直接用使用者名稱 base64 傳回去，不過最好應該還是造一個臨時 token 存在 db
    //       然後等下面的 faketoken 一跑進去，驗證這個臨時 token ！這個 token 就直接作廢
    //       而且這個 token 在 db 的時候應該是要指定這個使用者的
    const responseurl = util.format(
        '%s&code=%s',
        decodeURIComponent(request.body.responseurl),
        Buffer.from(request.body.userId).toString('base64'),
    );
    functions.logger.log(`Redirect to ${responseurl}`);
    return response.redirect(responseurl);
  } else {
    // Unsupported method
    response.send(405, 'Method Not Allowed');
  }
});

exports.fakeauth = functions.https.onRequest((request, response) => {
  const responseurl = util.format(
      '%s?state=%s',
      decodeURIComponent(request.query.redirect_uri),
      request.query.state,
  );
  functions.logger.log(`Set redirect as ${responseurl}`);
  return response.redirect(
      `/login?responseurl=${encodeURIComponent(responseurl)}`,
  );
});

exports.faketoken = functions.https.onRequest(async (request, response) => {
  const grantType = request.query.grant_type ?
    request.query.grant_type :
    request.body.grant_type;
  const refreshToken = request.query.refresh_token ?
    request.query.refresh_token :
    request.body.refresh_token;

  const secondsInDay = 86400; // 60 * 60 * 24
  const HTTP_STATUS_OK = 200;

  let obj;

  const accessToken = randomUUID();

  if (grantType === 'authorization_code') {
    // HACK: 照理說應該要去 db 拿 這個臨時 token，先去檢驗有沒有是不是有過期，然後再來對照他的使用者是誰，找到這個使用者這樣
    const userId = Buffer.from(request.body.code, 'base64').toString('ascii');
    // TODO: 如果找不到使用者？要處理這個錯誤

    functions.logger.log('Authorization Code', {
      userId,
    });

    await firebaseRef
        .child('userAccessTokens')
        .child(accessToken)
        .set({
          expiredAt: new Date() + secondsInDay,
          userId,
        });

    const refreshToken = randomUUID();

    await firebaseRef
        .child('userAccessTokens')
        .child(refreshToken)
        .set({
          expiredAt: new Date() + secondsInDay,
          userId,
          accessToken,
          isRefreshToken: true,
        });

    obj = {
      token_type: 'bearer',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: secondsInDay,
    };
  } else if (grantType === 'refresh_token') {
    const snapshot = await firebaseRef
        .child('userAccessTokens')
        .child(refreshToken)
        .once('value');

    functions.logger.log('Refresh Token', {
      refreshToken,
    });

    if (snapshot.val() == null) {
      functions.logger.warn('Cannot find in db', {
        refreshToken,
      });
      response.status(400).json({error: 'invalid_grant'});
      return;
    }

    const {
      isRefreshToken,
      userId,
      accessToken: oldAccessToken,
    } = snapshot.val();
    assert.ok(isRefreshToken === true);

    // TODO: 把原本的舊有 token disable 掉

    await firebaseRef.child('userAccessTokens').child(oldAccessToken).remove();

    await firebaseRef
        .child('userAccessTokens')
        .child(accessToken)
        .set({
          expiredAt: new Date() + secondsInDay,
          userId,
        });

    obj = {
      token_type: 'bearer',
      access_token: accessToken,
      expires_in: secondsInDay,
    };
  }
  response.status(HTTP_STATUS_OK).json(obj);
});

const app = smarthome();

app.onSync(async (body, headers) => {
  functions.logger.log('onSync', {body, headers});

  const userDoc = await queryUserFromHeaders(headers);
  if (userDoc === undefined) {
    functions.logger.warn('Cannot found user in db while onSync.');
    return {};
  }

  const {id: userId, agentId} = userDoc;

  functions.logger.log(`agentId = ${agentId}`);

  // FIXME: 我應該要有個 middleware 擋在這個 app 前面，然後去做身份驗證，讓這邊都只用 agentId 去做事
  //        不過因為現在先偷懶，所以只有在 onSync 的時候去真的判斷使用者，其他的函式就不判斷了，反正大家都是洗衣機
  return {
    requestId: body.requestId,
    payload: {
      agentUserId: agentId,
      devices: [
        {
          id: `${userId}Washer`,
          type: 'action.devices.types.WASHER',
          traits: [
            'action.devices.traits.OnOff',
            'action.devices.traits.StartStop',
            'action.devices.traits.RunCycle',
          ],
          name: {
            defaultNames: [`${userId}'s Washer`],
            name: `${userId}'s Washer`,
            nicknames: [`${userId}'s Washer`],
          },
          deviceInfo: {
            manufacturer: 'Acme Co',
            model: 'acme-washer',
            hwVersion: '1.0',
            swVersion: '1.0.1',
          },
          willReportState: true,
          attributes: {
            pausable: true,
          },
          otherDeviceIds: [
            {
              deviceId: 'TimmattVirtualDevice1',
            },
          ],
        },
      ],
    },
  };
});

const queryUser = async (userId) => {
  const snapshot = await firebaseRef.child('users').child(userId).once('value');
  const result = snapshot.val();
  result.id = userId;
  return result;
};

const queryUserByToken = async (token) => {
  const snapshot = await firebaseRef
      .child('userAccessTokens')
      .child(token)
      .once('value');

  // TODO: 檢查是否過期

  if (snapshot.val() == null) {
    return undefined;
  }

  const {userId} = snapshot.val();
  return queryUser(userId);
};

const queryUserFromHeaders = async (headers) => {
  const bearerToken = headers.authorization.substring(
      7,
      headers.authorization.length,
  );
  return queryUserByToken(bearerToken);
};

const queryDevice = async (deviceId) => {
  const snapshot = await firebaseRef
      .child('devices')
      .child(deviceId)
      .once('value');
  const snapshotVal = snapshot.val();

  return {
    on: snapshotVal.OnOff.on,
    isPaused: snapshotVal.StartStop.isPaused,
    isRunning: snapshotVal.StartStop.isRunning,
    currentRunCycle: [
      {
        currentCycle: 'rinse',
        nextCycle: 'spin',
        lang: 'en',
      },
    ],
    currentTotalRemainingTime: 1212,
    currentCycleRemainingTime: 301,
  };
};

app.onQuery(async (body) => {
  const {requestId} = body;
  const payload = {
    devices: {},
  };
  const queryPromises = [];
  const intent = body.inputs[0];
  for (const device of intent.payload.devices) {
    const deviceId = device.id;
    queryPromises.push(
        queryDevice(deviceId).then((data) => {
        // Add response to device payload
          payload.devices[deviceId] = data;
        }),
    );
  }
  // Wait for all promises to resolve
  await Promise.all(queryPromises);
  return {
    requestId: requestId,
    payload: payload,
  };
});

const updateDevice = async (execution, deviceId) => {
  const {params, command} = execution;
  let state;
  let ref;

  switch (command) {
    case 'action.devices.commands.OnOff':
      state = {on: params.on};
      ref = firebaseRef.child('devices').child(deviceId).child('OnOff');
      break;
    case 'action.devices.commands.StartStop':
      state = {isRunning: params.start};
      ref = firebaseRef.child('devices').child(deviceId).child('StartStop');
      break;
    case 'action.devices.commands.PauseUnpause':
      state = {isPaused: params.pause};
      ref = firebaseRef.child('devices').child(deviceId).child('StartStop');
      break;
  }

  return ref.update(state).then(() => state);
};

app.onExecute(async (body) => {
  const {requestId} = body;
  // Execution results are grouped by status
  const result = {
    ids: [],
    status: 'SUCCESS',
    states: {
      online: true,
    },
  };

  const executePromises = [];
  const intent = body.inputs[0];
  for (const command of intent.payload.commands) {
    for (const device of command.devices) {
      for (const execution of command.execution) {
        executePromises.push(
            updateDevice(execution, device.id)
                .then((data) => {
                  result.ids.push(device.id);
                  Object.assign(result.states, data);
                })
                .catch(() => functions.logger.error('EXECUTE', device.id)),
        );
      }
    }
  }

  await Promise.all(executePromises);
  return {
    requestId: requestId,
    payload: {
      commands: [result],
    },
  };
});

app.onDisconnect((body, headers) => {
  functions.logger.log('User account unlinked from Google Assistant');
  // Return empty response
  return {};
});

exports.smarthome = functions.https.onRequest(app);

exports.requestsync = functions.https.onRequest(async (request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  functions.logger.info(`Request SYNC for user ${request.agentUserId}`);
  try {
    const res = await homegraph.devices.requestSync({
      requestBody: {
        agentUserId: request.agentUserId,
      },
    });
    functions.logger.info('Request sync response:', res.status, res.data);
    response.json(res.data);
  } catch (err) {
    functions.logger.error(err);
    response.status(500).send(`Error requesting sync: ${err}`);
  }
});

/**
 * Send a REPORT STATE call to the homegraph when data for any device id
 * has been changed.
 */
exports.reportstate = functions.database
    .ref('devices/{deviceId}')
    .onWrite(async (change, context) => {
      functions.logger.info('Firebase write event triggered Report State');
      const snapshot = change.after.val();

      const {agentId: agentUserId} = await queryUser(snapshot.userId);

      const requestBody = {
        requestId: 'ff36a3cc' /* Any unique ID */,
        agentUserId,
        payload: {
          devices: {
            states: {
            /* Report the current state of our washer */
              [context.params.deviceId]: {
                on: snapshot.OnOff.on,
                isPaused: snapshot.StartStop.isPaused,
                isRunning: snapshot.StartStop.isRunning,
              },
            },
          },
        },
      };

      const res = await homegraph.devices.reportStateAndNotification({
        requestBody,
      });
      functions.logger.info('Report state response:', res.status, res.data);
    });

/**
 * Update the current state of the washer device
 */
exports.updatestate = functions.https.onRequest((request, response) => {
  firebaseRef.child('washer').update({
    OnOff: {
      on: request.body.on,
    },
    StartStop: {
      isPaused: request.body.isPaused,
      isRunning: request.body.isRunning,
    },
  });

  return response.status(200).end();
});
