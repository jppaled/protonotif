const express = require('express');
const fs = require('fs');
const notifier = require('node-notifier');
const openpgp = require('openpgp');
const path = require('path');
const ProtonMail = require('protonmail-api');

const connectedAccounts = [];
const wrongPassphraseMessage = 'Incorrect key passphrase';
const alreadyAddedMessage = 'Already added';

let PUB_KEY_ARMORED = null;
let PRIVATE_KEY_ARMORED = null;
let PASSPHRASE = null;

async function generate(password) {
  const { privateKeyArmored, publicKeyArmored } = await openpgp.generateKey({ 
    userIds: [{ name: 'protonotif', email: '' }], 
    passphrase: password 
  });

  if (privateKeyArmored && publicKeyArmored) {   
    // save armored pub and private key
    PUB_KEY_ARMORED = publicKeyArmored;
    PRIVATE_KEY_ARMORED = privateKeyArmored;
    
    // init account
    await saveAccountInFile([]);
    
    // save private key into file
    fs.writeFile('private.key', privateKeyArmored, function (err) {
      if (err) return console.log(err);
      console.log('private key created !');
    });

    // save private public key into file
    fs.writeFile('public.key', publicKeyArmored, function (err) {
      if (err) return console.log(err);
      console.log('public key created !');
    });
    
    return true;
  }

  console.log('private and pub generation failed');
  
  return false;
}

async function getAccountFromFile() {
  const privateKey = (await openpgp.key.readArmored([PRIVATE_KEY_ARMORED])).keys[0];
  
  await privateKey.decrypt(PASSPHRASE);  
  
  const encryptedData = fs.readFileSync('accounts');
  
  const decrypted = await openpgp.decrypt({
    message: await openpgp.message.readArmored(encryptedData),
    privateKeys: [privateKey]
  });

  console.log('decryption success !');

  return JSON.parse(decrypted.data);
}

async function saveAccountInFile(data) {   
  const encrypted = await openpgp.encrypt({
    message: openpgp.message.fromText(JSON.stringify(data)),
    publicKeys: (await openpgp.key.readArmored(PUB_KEY_ARMORED)).keys
  }); 

  // save private key into file
  fs.writeFile('accounts', encrypted.data, function (err) {
    if (err) return console.log(err);

    // if succefully create encrypted file
    console.log(`data has been encrypted...`);
  });
}

function sendNotification(unsername, nbUnread) {
  notifier.notify(
    {
      title: 'Protonotif',
      message: `${nbUnread} new email for ${unsername}`,
      icon: path.join(__dirname, 'icon.png'), // Absolute path (doesn't work on balloons)
      sound: true, // Only Notification Center or Windows Toasters
      wait: true // Wait with callback, until user action is taken against notification, does not apply to Windows Toasters as they always wait or notify-send as it does not support the wait option
    },
    function (err, response, metadata) {
      // Response is response from notification
      // Metadata contains activationType, activationAt, deliveredAt
    }
  );
}

async function getUnread(connectedAccount) {
  let inbox = await connectedAccount.client.getEmailCounts();
  
  let unread = inbox.folders.inbox.unread;

  if (unread > 0) {
    sendNotification(connectedAccount.unsername, unread);
  }

  return unread;
}

var app = express();
app.use(express.json())
app.use(express.urlencoded({ extended: true }));

app.post('/generatekey', async function (req, res) {
  const password = req.body.password;

  if (password) {
    const isKeyGenereted = await generate(password);

    if (isKeyGenereted) {
      res.sendFile(path.join(__dirname, '/generateKeySuccess.html'));
    }
  }
})

app.post('/login', async function (req, res) {
  PUB_KEY_ARMORED = fs.readFileSync('./public.key');
  PRIVATE_KEY_ARMORED = fs.readFileSync('./private.key');
  
  const privateKey = (await openpgp.key.readArmored(PRIVATE_KEY_ARMORED)).keys[0];

  try {
    await privateKey.decrypt(req.body.password);
    
    console.log('login succefully !')
    
    // save passphrase
    PASSPHRASE = req.body.password;

    res.redirect(301, '/');
  } catch (err) {
    if (err.message.includes(wrongPassphraseMessage)) {
      console.log(wrongPassphraseMessage);
      res.send(wrongPassphraseMessage);
    }
  }
})

app.post('/addaccount', async function (req, res) {
  const email = req.body.email;
  const password = req.body.password;
  let alreadyAdded = false;

  let accounts = await getAccountFromFile();
  
  for (let account of accounts) {
    if (account.username === email) {
      alreadyAdded = true;
      
      console.log(alreadyAddedMessage);
      
      res.send(alreadyAddedMessage);
      
      break;
    }
  }
  
  if (!alreadyAdded) {
    accounts.push({username: email, password: password});
    
    await saveAccountInFile(accounts);
    
    console.log(`${email} added!`);
    
    res.redirect(301, '/');
  }
})

app.get('/unread/:email*?', async function(req, res) {
  let email = req.params.email;

  if (email) { 
    for (let connectedAccount of connectedAccounts) {
      if (connectedAccount.username === email) {
        const unread = await getUnread(connectedAccount);
        
        res.json(unread);
        
        return;
      }
    }
  } else {
    let allUnread = [];

    for (let connectedAccount of connectedAccounts) {
      const unread = await getUnread(connectedAccount);
      
      allUnread.push({"email": connectedAccount.username, "unread": unread});
    }

    res.json(allUnread);
    
    return;
  }

  res.send(`Account ${email} not found\n`);
  
  return;
})

app.get('/add', function (req, res) {  
  res.sendFile(path.join(__dirname, '/add.html'));
});

app.get('/lock', function (req, res) {
  PASSPHRASE = null;
  res.redirect('/');
});

app.get('/login', function (req, res) {
  res.sendFile(path.join(__dirname, '/login.html'));
});

app.get('/', async function (req, res) {  
  if(!fs.existsSync('private.key') || !fs.existsSync('public.key')) {
    res.sendFile(path.join(__dirname, '/generateKey.html'));
  } else {
    if (PASSPHRASE != null) {

    // connect all accounts
    let accounts = await getAccountFromFile();

    accounts.forEach(async (account) => {
      console.log(`try to connect ${account.username}`);
      await ProtonMail.connect({
        username: account.username,
        password: account.password
      })
      .then(result => {
        console.log(`${account.username} logged !`);
        connectedAccounts.push({username: account.username, client: result});
      })
      .catch((err) => {
        console.log(err);

        console.log(
          'If you see an  error with "waiting for selector `#ptSidebar` failed...", that mean that the web page return the prontmail page with the captcha to fill',
          'I don\'t have a solution for this because I don\'t develop the custom protonmail-api',
          'And this custom api is no longer maintened',
          'Wait some hours or try to connect to a VPN and retry'
        );
      });
    })

      res.sendFile(path.join(__dirname, '/index.html'));
    } else {
      res.redirect(301, '/login')
    }
  }
});

app.listen(3010, function () {

});