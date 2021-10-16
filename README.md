# protonotif
Get protonmail notification on desktop

## Install

```
git clone https://github.com/jppaled/protonotif.git
cd protonotif
npm i install
npm start
```
## How to use it
- Go to [localhost:3010](http://localhost:3010)
- Follow indications

Once your had add your protonmail account, you can go to [unread](http://localhost:3010/unread), to get a JSON that show how many unread messages you have for each account.

If you have 1 or more unread messages, a notification appear on your desktop

Or your can use curl and then a notification appear
```
curl localhost:3010/unread 
```
![protonotif_notification](https://user-images.githubusercontent.com/22444128/137594591-cc88b07b-8f37-4aee-b8b0-87ca08ad6a17.png)


I use this for a cron to check if I got some unread messages

## Dependencies
- node@10

## Npm package dependencies
- express
- fs
- node-notifier
- openpgp@4.10.10 (not @5 because of node@10
- path
- protonmail-api
