
const dgram = require('dgram');
const{ execFile } = require('child_process');
const fs = require('fs');

let server = dgram.createSocket('udp4');
let state = 'started';

const db = ['*', 'updComs'].indexOf((process.env.DEBUG || '').trim()) >= 0;
const debug = (db) ? statement => console.log(statement) : statement => statement;
const errorTimeout = 3 * 1000;

const wslPath = path => path.replace(/\\/g, '/').replace(/([A-Za-z]):/, '/mnt/$1').toLowerCase();
const winPath = path => path.replace(/\/mnt\/([a-z])/, '$1:');
let pathConv = wslPath;

if(process.platform === 'win32') {
  pathConv = winPath;
  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on('SIGINT', () => {
    debug('SIGINT commabd');
    process.emit('SIGINT');
  });
}

process.on('SIGINT', () => {
  // if second signal received close straight away
  debug(`SIGINT received. Program state ${state}`);
  if(state === 'closing') process.exit();
  state = 'closing';
  // close in 1 second if server doesn't close nicely
  setTimeout(process.exit, 1000);
  // close server then exit
  server.close();
});

function closeServer() {
  console.log('Timeout');
  server.close();
}

const args = process.argv.slice(2);
let config = '';

const configFile = `${__dirname}/udpcoms.json`;
try {
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch(err) {
  debug(`No config file or unable to parse ${configFile}\n${err}`);
}

function getArgs(allArgs, argName) {
  const nameIndex = allArgs.indexOf(`-${argName}`);
  let argValue;
  if(nameIndex >= 0) [, argValue] = allArgs.splice(nameIndex, 2);
  if(config) {
    argValue = (argValue || config[argName]);
    delete config[argName];
  }
  if(argValue) debug(`From args: "${argName} value is: ${argValue}`);
  argValue = (typeof argValue === 'string') ? argValue.replace(/'/g, '') : argValue;
  return(typeof argValue === 'undefined' ? '' : argValue);
}

let ipAdd = getArgs(args, 'ip');
const portNumber = Number(getArgs(args, 'port')) || 6789;
let retries = Number(getArgs(args, 'retries')) || 10;
let mode = getArgs(args, 'mode');
pathConv = String(getArgs(args, 'conv')).toLocaleLowerCase() === 'false' ? path => path : pathConv;
let runCmds = Object.keys(config).length ? config : {};


getArgs(args, 'cmds').split(',').forEach(action => {
  const[cmd, ...path] = action.split(':');
  if(cmd) runCmds[cmd] = path.join(':');
});

const message = args;
mode = (mode || ((ipAdd && message.length) ? 'send' : 'server'));

const serverPort = (mode === 'server') ? portNumber : portNumber + 1;
const sendPort = (mode === 'server') ? portNumber + 1 : portNumber;


debug(`ip:${ipAdd}\nports:${sendPort}/${serverPort}\nmsg${message}\nmode:${mode}\nretires:${retries}`);

Object.entries(runCmds).forEach(([cmd, path]) => {
  runCmds[cmd] = pathConv(path);
});

if(mode === 'server') debug(`Active commands ${JSON.stringify(runCmds)}`);
else runCmds = {};

const startTimes = [Date.now()];


function formatMsg(payload) {
  const fix = Buffer.from('0000aa550000aa55', 'hex');
  const msg = Buffer.from(JSON.stringify(payload));
  return Buffer.concat([fix, msg, fix]);
}

function parseMsg(packet) {
  let msg = packet;
  if(msg.readUInt32BE(0) !== 0x0000aa55 || msg.readUInt32BE(msg.length - 4) !== 0x0000aa55) {
    console.error('Prefix or postfix arn\'t as expected\nExpected: 0x0000aa55');
    console.error(`Pre: ${msg.readUInt32BE(0)} \nPost: ${msg.readUInt32BE(msg.length - 4)}`);
    if(!db)return'';
  }
  msg = msg.slice(8, msg.length - 8);
  return JSON.parse(msg);
}

function actionMessage(data) {
  if(typeof (data) !== 'undefined') {
    if(data.result) {
      Object.keys(data.result[0]).forEach(resp => {
        console.log(`${resp}:${JSON.stringify(data.result[0][resp])}`);
      });
    } else {
      Object.keys(data).forEach(cmd => {
        const run = runCmds[cmd];
        if(run) {
          console.log(`Running: ${run} ${data[cmd].join(' ')}`);
          execFile(run, data[cmd], (error, stdout, stderr) => {
            if(error) {
              console.error(`Error ${error} running ${run} ${data[cmd].join(' ')}`);
            }
            debug(stdout);
            debug(stderr);
            const result = ['result', { stdout, stderr, error }];
            if(!db && error) setTimeout(sendMessage, errorTimeout, ipAdd, sendPort, ['result', { Error: 'Error' }]);
            else sendMessage(ipAdd, sendPort, result);
          });
        } else {
          console.log(`Command name ${cmd} not in ${JSON.stringify(runCmds)}`);
          if(db) sendMessage(ipAdd, sendPort, ['result', { Error: `Command name ${cmd} not in ${JSON.stringify(runCmds)}` }]);
          else setTimeout(sendMessage, errorTimeout, ipAdd, sendPort, ['result', { Error: 'Error' }]);
        }
      });
    }
  }
}

function setupServer() {
  server = dgram.createSocket('udp4');
  server.on('close', () => {
    debug('server closed');
    if(state === 'closing' || state === 'waiting' || retries === 0) {
      process.exit();
    } else {
      debug(`Retires remainting ${retries}`);
      setupServer();
      startComs();
    }
  });
  server.on('error', err => {
    console.error(`server error:\n${err}`);
    if(err.code === 'EADDRINUSE') {
      console.error('The Port is in use, maybe this program is already running or another program is using that port');
    }
    server.close();
    if(state === 'closing') process.exit();
  });
}

function sendMessage(ip, port, cmd) {
  try {
    debug(`Sending ${cmd} to ${ip}:${port}`);
    const data = {};
    data[cmd.shift()] = cmd;
    const msg = formatMsg({ data });
    debug(`Msg is:${msg}\nLength:${cmd.length}`);
    server.send(msg, port, ip, (err, bytes) => {
      if(err) {
        console.error(`Error: ${err}`);
        state = (state === 'closing' ? state : 'retrying');
      } else {
        console.log('Message sent');
        debug(`Msg:${msg}\nLength:${bytes}`);
        if(mode !== 'server') {
          state = 'waiting';
          setTimeout(closeServer, 5 * 1000);
        }
      }
    });
  } catch(error) {
    console.error(`Error with parsing message: ${error}`);
    server.close();
  }
}

function listenMessages(port) {
  debug('starting server');
  server.on('message', (msg, rinfo) => {
    debug(`server received: ${msg} from ${rinfo.address}:${rinfo.port}`);
    ipAdd = rinfo.address;
    try {
      const packet = parseMsg(msg);
      actionMessage(packet.data);
    } catch(error) {
      console.error(`Error in parsing input:${error}`);
      if(state === 'closing') server.close();
    }
    if(state === 'waiting') {
      state = 'closing';
      server.close();
    }
  });
  server.on('listening', () => {
    const address = server.address();
    console.log(`Server listening ${address.address}:${address.port}`);
    Object.keys(runCmds).forEach(element => {
      console.log(`Command: ${element}, runs: ${runCmds[element]}`);
    });
    console.log('Press Ctrl + c to exit');
  });
  server.bind(port);
}

function startComs(rate = 2) {
  if(state === 'closing') server.close();
  startTimes.push(Date.now());
  const startCount = startTimes.filter(time => time > Date.now() - rate * rate * 1000).length - 1;
  if(startCount > rate) {
    console.warn(`Rate limit exceeded, ${startCount} restarts in ${rate} seconds`);
    if(mode === 'server') {
      // eslint-disable-next-line no-param-reassign
      rate *= rate;
      console.log(`Trying againt in ${rate} seconds`);
      setTimeout(startComs, rate * 1000, rate);
    } else {
      console.log('Error unable to send');
      state = 'closing';
      server.close();
    }
  } else {
    retries -= 1;
    setupServer();
    listenMessages(serverPort);
    if(mode !== 'server') sendMessage(ipAdd, sendPort, message);
  }
}
startComs();
