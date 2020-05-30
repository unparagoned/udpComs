
/* eslint no-param-reassign: ["error", { "props": true, "ignorePropertyModificationsFor": ["conf"] }] */

const dgram = require('dgram');
const{ exec } = require('child_process');
const fs = require('fs');
const Parser = require('./lib/message-parser');

let server = dgram.createSocket('udp4');
let state = 'started';
const configFile = 'cmds.config';

if(process.platform === 'win32') {
  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('SIGINT', () => {
    process.emit('SIGINT');
  });
}

process.on('SIGINT', () => {
  // if second signal received close straight away
  if(state === 'closing') process.exit();
  state = 'closing';
  // close in 1 second if server doesn't close nicely
  setTimeout(process.exit, 1000);
  // close server then exit
  server.close();
});

function debug(statement) {
  if(process.env.DEBUG === '*' || process.env.DEBUG === 'udpComs') {
    console.log(statement);
  }
}

const args = process.argv.slice(2);

function getArgs(allArgs, argName, conf) {
  const nameIndex = allArgs.indexOf(`-${argName}`);
  let argValue;
  if(nameIndex >= 0) {
    [, argValue] = allArgs.splice(nameIndex, 2);
    argValue = (typeof (argValue) !== 'undefined' ? argValue.replace(/'/g, '') : argValue);
    debug(`"${argName} value is: ${argValue}`);
  } else if(conf) {
    argValue = conf[argName];
    delete conf[argName];
  }
  return(typeof (argValue) !== 'undefined' ? argValue : '');
}

let config = '';
try {
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch(err) {
  debug(`No config file or unable to parse ${configFile}\n${err}`);
}
const runCmds = (Object.keys(config).length ? config : {});

getArgs(args, 'cmds', config).split(',').forEach((action) => {
  const cmd = action.split(':');
  runCmds[cmd[0]] = cmd[1];
});

const ipAdd = getArgs(args, 'ip', config);
const portNum = (getArgs(args, 'port', config) || '6789');
let retries = getArgs(args, 'retries', config);
retries = (Number.isInteger(retries) ? retries : 10);
let mode = getArgs(args, 'mode', config);
const message = args;
mode = (mode || (ipAdd && message.length) ? 'send' : 'server');
debug(`ip:${ipAdd}\nport:${portNum}\nmsg${message}\nmode:${mode}\nretires:${retries}`);
if(mode === 'server') debug(`Active commands ${JSON.stringify(runCmds)}`);
const startTimes = [Date.now()];

function actionMessage(data) {
  if(typeof (data) !== 'undefined') {
    Object.keys(data).forEach((cmd) => {
      const run = runCmds[cmd];
      if(run) {
        console.log(`Running: ${run} ${data[cmd].join(' ')}`);
        exec(`${run} ${data[cmd].join(' ')}`);
      } else {
        console.log(`Command name ${cmd} not in ${JSON.stringify(runCmds)}`);
      }
    });
  }
}

function setupServer() {
  server = dgram.createSocket('udp4');
  server.on('close', () => {
    debug(`server closed\nRetires remainting ${retries}`);
    if(state === 'closing' || retries === 0) {
      process.exit();
    } else {
      setupServer();
      startComs();
    }
  });
  server.on('error', (err) => {
    console.error(`server error:\n${err}`);
    if(err.code === 'EADDRINUSE') {
      console.error('The Port is in use, maybe this program is already running or another program is using that port');
    }
    server.close();
  });
}

function sendMessage(ip, port, cmd) {
  try {
    debug(`Sending ${cmd} to ${ip}:${port}`);
    const data = {};
    data[cmd.shift()] = cmd;
    const msg = (mode === 'raw' ? cmd : Parser.encode({ data, commandByte: 2 }));
    server.send(msg, port, ip, (err, bytes) => {
      if(err) {
        console.error(`Error: ${err}`);
        state = 'retrying';
      } else {
        console.log('Message sent');
        debug(`Msg:${bytes}\nLength:${bytes}\nRaw:${msg}`);
        state = 'closing';
      }
      server.close();
    });
  } catch(error) {
    console.error(`Error with parsing message: ${error}`);
  }
}

function listenMessages(port) {
  debug('starting server');
  server.on('message', (msg, rinfo) => {
    debug(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
    try {
      const packet = Parser.parse(msg);
      actionMessage(packet.data);
    } catch(error) {
      console.error(`Error in parsing input:${error}`);
    }
  });
  server.on('listening', () => {
    const address = server.address();
    console.log(`server listening ${address.address}:${address.port}, Press Ctrl+c to exit`);
  });
  server.bind(port);
}

function startComs(rate = 2) {
  startTimes.push(Date.now());
  const startCount = startTimes.filter((time) => time > Date.now() - rate * rate * 1000).length - 1;
  if(startCount > rate) {
    console.warn(`Rate limit exceeded, ${startCount} restarts in ${rate} seconds`);
    if(mode === 'server') {
      // eslint-disable-next-line no-param-reassign
      rate *= rate;
      console.log(`Trying againt in ${rate} seconds`);
      setTimeout(startComs, rate * 1000, rate);
    } else {
      console.log('Error unable to send');
    }
  } else {
    retries -= 1;
    setupServer();
    if(mode === 'server') listenMessages(portNum);
    else sendMessage(ipAdd, portNum, message);
  }
}
startComs();
