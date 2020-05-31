
/* eslint no-param-reassign: ["error", { "props": true, "ignorePropertyModificationsFor": ["conf"] }] */

const dgram = require('dgram');
const{ execFile } = require('child_process');
const fs = require('fs');
const Parser = require('./lib/message-parser');

let server = dgram.createSocket('udp4');
let state = 'started';
const configFile = `${__dirname}/cmds.config`;

if(process.platform === 'win32') {
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

function debug(statement) {
  if(process.env.DEBUG === '*' || process.env || process.env.DEBUG === 'udpComs') {
    console.log(statement);
  }
}

const args = process.argv.slice(2);
let config = '';

function getArgs(allArgs, argName, conf) {
  const nameIndex = allArgs.indexOf(`-${argName}`);
  let argValue;
  if(conf) {
    argValue = conf[argName];
    delete conf[argName];
  }
  if(nameIndex >= 0) {
    [, argValue] = allArgs.splice(nameIndex, 2);
    argValue = (typeof (argValue) !== 'undefined' ? argValue.replace(/'/g, '') : argValue);
    debug(`"${argName} value is: ${argValue}`);
  }
  return(typeof (argValue) !== 'undefined' ? argValue : '');
}

try {
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch(err) {
  debug(`No config file or unable to parse ${configFile}\n${err}`);
}

let ipAdd = getArgs(args, 'ip', config);
const portNum = Number(getArgs(args, 'port', config) || 6789);
let retries = getArgs(args, 'retries', config);
retries = (Number.isInteger(retries) ? retries : 10);
let mode = getArgs(args, 'mode', config);
let runCmds = (Object.keys(config).length ? config : {});

getArgs(args, 'cmds', config).split(',').forEach(action => {
  const cmd = action.split(':');
  if(cmd[0]) runCmds[cmd[0]] = cmd[1];
});

const message = args;
mode = (mode || ((ipAdd && message.length) ? 'send' : 'server'));
const serverPort = (mode === 'server' ? portNum : portNum + 1);
debug(`ip:${ipAdd}\nport:${portNum}\nmsg${message}\nmode:${mode}\nretires:${retries}`);

if(mode === 'server') debug(`Active commands ${JSON.stringify(runCmds)}`);
else runCmds = {};

const startTimes = [Date.now()];

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
            const result = ['result', { error, stdout, stderr }];
            sendMessage(ipAdd, portNum + 1, result);
          });
        } else {
          console.log(`Command name ${cmd} not in ${JSON.stringify(runCmds)}`);
          sendMessage(ipAdd, portNum + 1, ['result', { Error: 'Error' }]);
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
    let msg = cmd;
    if(mode !== 'raw') {
      data[cmd.shift()] = cmd;
      msg = Parser.encode({ data, commandByte: 2 });
    }
    debug(`Msg is:${msg}\nLength:${cmd.length}\nRaw:${cmd}`);
    server.send(msg, port, ip, (err, bytes) => {
      if(err) {
        console.error(`Error: ${err}`);
        state = (state === 'closing' ? state : 'retrying');
      } else {
        console.log('Message sent');
        debug(`Msg:${msg}\nLength:${bytes}\nRaw:${cmd}`);
        if(mode !== 'server') {
          state = 'waiting';
          setTimeout(server.close, 5 * 1000);
        }
      }
    });
  } catch(error) {
    console.error(`Error with parsing message: ${error}`);
  }
}

function listenMessages(port) {
  debug('starting server');
  server.on('message', (msg, rinfo) => {
    debug(`server received: ${msg} from ${rinfo.address}:${rinfo.port}`);
    ipAdd = rinfo.address;
    debug(`msg length ${msg.length}`);
    try {
      const packet = Parser.parse(msg);
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
    }
  } else {
    retries -= 1;
    setupServer();
    listenMessages(serverPort);
    if(mode !== 'server') sendMessage(ipAdd, portNum, message);
  }
}
startComs();
