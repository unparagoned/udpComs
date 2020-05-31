/* From https://codetheweb.github.io/tuyapi. */

const debug = require('debug')('udpComs:MessageParser');

/**
* Class for decoding and encoding payloads.
* @class
* @private
*/
class MessageParser {
  constructor() {
    this._parsed = false;
    this._buff = Buffer.alloc(0);
    this._payloadSize = undefined;
    this._data = undefined;
    this._leftOver = undefined;
    this._commandByte = undefined;
  }

  /**
  * Append data to current buffer.
  * @param {Buffer} buff data to append
  * @private
  */
  _append(buff) {
    this._buff = Buffer.concat([this._buff, buff]);
  }

  /**
  * Parse current buffer stored in instance.
  * @returns {Boolean} true if successfully parsed
  * @private
  */
  _parse() {
    if (this._parsed) {
      return true;
    }

    // Check for length
    if (this._buff.length < 16) {
      debug('Packet too small. Length:', this._buff.length);
      return false;
    }
    debug(this._buff.length);
    // Check for prefix
    const prefix = this._buff.readUInt32BE(0);

    if (prefix !== 0x000055AA) {
      //throw new Error('Magic prefix mismatch: ' + this._buff.toString('hex'));
    }

    // Check for suffix
    const suffix = this._buff.readUInt32BE(this._buff.length - 4);

    if (suffix !== 0x0000AA55) {
      //throw new Error('Magic suffix mismatch: ' + this._buff.toString('hex'));
    }

    // Get payload size
    if (!this._payloadSize) {
      this._payloadSize = this._buff.readUInt32BE(12);
    }

    this._commandByte = this._buff.readUInt8(11);

    // Check for payload
    if (this._buff.length - 8 < this._payloadSize) {
      debug('Packet missing payload.', this._buff.length, this._payloadSize);
      //this._data = '';
      //return false;
    }
    debug(`this ${this._buff}`);
    // Slice off CRC and suffix
    this._data = this._buff.slice(0, this._buff.length - 8);
    debug(`this ${this._data}`);
    // Slice off begining of packet, remainder is payload
    this._data = this._data.slice(this._data.length - this._payloadSize + 8);
    debug(`this ${this._data}`);
    // Remove 0 padding from payload
    let done = false;
    while (done === false) {
      if (this._data[0] === 0) {
        this._data = this._data.slice(1);
        debug(`this ${this._data}`);
      } else {
        done = true;
      }
    }

    return true;
  }

  /**
  * Attempt to parse data to JSON.
  * @returns {Object} result
  * @returns {String|Buffer|Object} result.data decoded data, if available in response
  * @returns {Number} result.commandByte command byte from decoded data
  * @private
  */
  _decode() {
    const result = {
      commandByte: this._commandByte
    };
    // It's possible for packets to be valid
    // and yet contain no data.
    if(this._data.length === 0) {
      debug(`len- 0 ${result}`);
      return result;
    }

    // Try to parse data as JSON.
    // If error, return as string.

    try {
      result.data = JSON.parse(this._data);
      debug(`end this ${this._data}`);
      debug(`result ${result.data}`);
    } catch (error) { // Data is encrypted
      result.data = this._data.toString('ascii');
      debug(`catcgh ${result}`);
    }
    debug(result);
    return result;
  }

  /**
  * Encode data (usually an object) into
  * a protocol-compliant form that a device
  * can understand.
  * @param {Object} options
  * @param {String|Buffer|Object} options.data data to encode
  * @param {Number} options.commandByte command byte
  * @returns {Buffer} binary payload
  * @private
  */
  _encode(options) {
    // Ensure data is a Buffer
    let payload;

    if (options.data instanceof Buffer) {
      payload = options.data;
    } else {
      if (typeof options.data !== 'string') {
        options.data = JSON.stringify(options.data);
      }

      payload = Buffer.from(options.data);
    }

    // Generate prefix (including command and length bytes)
    const prefix = Buffer.from('000055aa00000000000000' +
                               (options.commandByte < 16 ? '0' : '') +
                                options.commandByte.toString(16), 'hex');

    // Suffix is static
    const suffix = Buffer.from('0000aa55', 'hex');

    // As devices don't seem to care,
    // just use an empty CRC for now.
    const crc32Buffer = Buffer.from('00000000', 'hex');

    // Calculate length (everything past length byte)
    const len = Buffer.allocUnsafe(4);
    len.writeInt32BE(Buffer.concat([payload, crc32Buffer, suffix]).length, 0);

    // Concat buffers
    const concatBuffer = Buffer.concat([prefix, len, payload, crc32Buffer, suffix]);

    return concatBuffer;
  }
}

/**
* Static wrapper for lower-level MessageParser
* functions to easily parse packets.
* @param {Buffer} data packet to parse
* @returns {Object} result
* @returns {String|Buffer|Object} result.data decoded data, if available in response
* @returns {Number} result.commandByte command byte from decoded data
*/
function parse(data) {
  const p = new MessageParser();

  p._append(data);
  debug(`p ${p._buff.toString('ascii')}`);
  p._parse();
  debug(`p ${p._data.toString('ascii')}`);
  return p._decode();
}

/**
* Static wrapper for lower-level MessageParser
* functions to easily encode packets
* @param {Object} options
* @param {String|Buffer|Object} options.data data to encode
* @param {Number} options.commandByte command byte
* @returns {Buffer} binary payload
*/
function encode(options) {
  const p = new MessageParser();
  return p._encode({data: options.data, commandByte: options.commandByte});
}

module.exports = {parse, encode};
