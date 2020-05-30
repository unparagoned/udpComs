/* eslint no-use-before-define: ["error", { "functions": false }] */

const dgram = require('dgram');
const{ exec } = require('child_process');
const Parser = require('./lib/message-parser');

let server = dgram.createSocket('udp4');
let state = 'started';

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

function getArgs(allArgs, argName) {
  const nameIndex = allArgs.indexOf(argName);
  let argValue = '';
  if(nameIndex >= 0) {
    argValue = allArgs[nameIndex + 1];
    argValue = (argValue !== undefined ? argValue.replace(/'/g, '') : argValue);
    debug(`"${argName} value is: ${argValue}`);
  }
  return argValue;
}

const ipAdd = getArgs(args, '-ip');
const portNum = (getArgs(args, '-port') || '6868');
const message = getArgs(args, '-msg');
const mode = (getArgs(args, '-mode') || (ipAdd && message) ? 'send' : 'server');
debug(`ip:${ipAdd}\nport:${portNum}\nmsg${message}\nmode:${mode}`);
const startTimes = [Date.now()];

server.on('close', () => {
  if(state === 'closing') {
    process.exit();
  } else{
    server = dgram.createSocket('udp4');
    startComs();
  }
});

server.on('error', (err) => {
  console.log(`server error:\n${err.stack}`);
  server.close();
  server = dgram.createSocket('udp4');
  startComs();
});

function sendMessage(ip, port, cmd) {
  try{
    const data = {};
    data[cmd.shift()] = cmd;
    const msg = Parser.encode({ data, commandByte: 2 });
    server.send(msg, port, ip, (err, bytes) => {
      console.log('Message sent');
      debug(`Msg:${bytes}\nlength:${bytes}\raw${msg}`);
      if(err) console.error(`Error ${err}`);
    });
  } catch(error) {
    console.error(`Error with parsing message: ${error}`);
  }
}

function actionMessage(data) {
  if(typeof (data) !== 'undefined') {
    Object.keys(data).forEach((cmd) => {
      if(cmd === 'nircmd') {
        console.log(`/mnt/c/windows/nircmd.exe ${data[cmd].join(' ')}`);
        exec(`/mnt/c/windows/nircmd.exe ${data[cmd].join(' ')}`);
      }
    });
  }
}

function listenMessages(port) {
  server.on('message', (msg, rinfo) => {
    debug(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
    try{
      const packet = Parser.parse(msg);
      actionMessage(packet.data);
    } catch(error) {
      console.log(`Error in parsing input:${error}`);
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
  const startCount = startTimes.filter((time) => time > Date.now() - rate * rate * 1000).length;
  if(startCount > rate) {
    debug(`Rate limit exceeded, ${startCount} restarts in ${rate} seconds`);
    if(mode === 'server') {
      // eslint-disable-next-line no-param-reassign
      rate *= rate;
      debug(`Timeout set to ${rate * 1000}`);
      setTimeout(startComs, rate * 1000, rate);
    } else{
      console.log('Error unable to send');
    }
  } else if(mode === 'server') listenMessages(portNum);
  else sendMessage(ipAdd, portNum, message);
}
startComs();
