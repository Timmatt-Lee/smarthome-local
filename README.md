# Smart home local execution codelab

This project contains the source for for the [Smart Home Local Execution codelab](https://codelabs.developers.google.com/codelabs/smarthome-local),
which demonstrates how to integrate a local execution using a Google Home device
with an existing smart home cloud project.

---

## Update

### Virtual Device

1. Typescript, always better.
1. Support multiple virtual devices, through inherit (better code structure).
1. Better look of logging.
1. Use .env instead of long and hard to maintained argv.

### Local fulfillment

1. Support multiple devices.
1. Support `type.FAN`.

### Cloud fulfillment

1. REAL Oauth2 flow in fulfillment.
   - Middleware access token before onSync api.
1. Support multiple agents(users)
   - Support multiple devices and controlled by an agent(user) without conflict.
   - Store device info (the thing retrieved onSync) in db for dynamic observation of request sync.
1. Support multiple devices
1. Support `type.FAN`.

## TODO

1. Index public html support multiple devices (like Home Playground)
1. Virtual Device support mock two UDP in one machine (or is it possible?)

## Get Started

Follow [Smart Home Local Execution codelab](https://codelabs.developers.google.com/codelabs/smarthome-local)

**_Notice:_** _the command to start virtual device is `npm run start`. Before that you should replace `.env.example` with your data and save it as `.env` to make server work._

---

## Support

- Stack Overflow: https://stackoverflow.com/questions/tagged/google-smart-home

If you've found an error in this codelab, please file an issue:
https://github.com/googlecodelabs/smarthome-local/issues

## License

Copyright 2019 Google LLC

Licensed to the Apache Software Foundation (ASF) under one or more contributor license agreements. See the NOTICE file distributed with this work for additional information regarding copyright ownership. The ASF licenses this file to you under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
