import fs from 'fs';
import ogg from 'ogg';
import OggPacket from 'ogg-packet';
import _debug from 'debug';

const debug = _debug('recorder:ogg');

// Maximum amount of silence per page
const MAX_SILENCE_PER_PAGE = 500;

// Create a random OGG serial number for the stream
const mkSerial = () => Math.round(Math.random() * (2 ** 32 - 1));

// Convert an object into an array of buffers, for inclusion into an
// OpusTags packet.
// The comments in an OpusTags packet are encoded as follows:
// - # of comments (32 bits)
// - # bytes for the first comment ("key=value")
// - The comment string
// - ...
function opusTags(obj) {
  const nrComments = Buffer.alloc(4);
  nrComments.writeUInt32LE(Object.keys(obj || {}).length);
  const result = [nrComments];
  Object.entries(obj || {}).forEach(([key, value]) => {
    const comment = `${key}=${value}`;
    const commentLen = Buffer.alloc(4);
    commentLen.writeUInt32LE(comment.length);
    const commentBuf = Buffer.from(comment);
    result.push(commentLen);
    result.push(commentBuf);
  });
  return result;
}

// Calculate the 'config' value for the TOC byte that starts off an Opus
// packet. This is based on the remaining number of milliseconds to add for
// this OGG page.
//
// Returns {
//   time: Time this type will fill up in ms
//   type: The value for the config bits in the TOC byte (shift 3 bits for
//         the byte value)
// }
function opusType(ms) {
  const result = {
    time: 60,
    type: 11,
  };
  if (ms < 60) {
    if (ms >= 40) {
      result.time = 40;
      result.type = 10;
    } else if (ms >= 20) {
      result.time = 20;
      result.type = 9;
    } else {
      result.time = 10;
      result.type = 8;
    }
  }
  return result;
}

// Create a new Opus packet (OGG segment), given that we have 'ms' milliseconds
// of silence to generate still.
//
// Returns {
//   packet:    The new packet
//   remaining: The remaining time to generate silence for, after this
//              packet is added.
// }
function createOpusPacket(ms) {
  const packet = new OggPacket();
  // The Opus packet is only 1 byte long, the TOC byte
  const opusPacket = Buffer.alloc(1);
  // Calculate the TOC.config value for this packet
  const tocConfig = opusType(ms);
  // Opus TOC.config is bits 3-8
  opusPacket.writeUInt8(tocConfig.type << 3);

  // We pack multiple Opus packets into a single OGG page. The way to do that is
  // to set the granulepos to -1 except for the past Opus packet on the page.
  packet.granulepos = -1;

  // Put the opus packet into the OGG packet
  packet.packet = opusPacket;
  packet.bytes = opusPacket.length;

  return {
    packet,
    remaining: ms - tocConfig.time,
  };
}

// Common function for creating an OGG decoder. Used for both silence and sound
// files.
function createDecoder(
  // The encoder-stream
  outStream,
  // Opus tags as a javascript object
  tags,
  // The granulepos to start from
  baseGranulepos,
  // Callback to call when done. Triggers the decoding/encoding of the next
  // element in the list.
  onEnd,
  // Should we write an E-O-S package?
  writeEos,
  // Function to call when the decoder has decoded a packet
  onPacket,
) {
  // Create a new OGG decoder
  const decoder = new ogg.Decoder();

  // Remember the last generated granulepos. When we're done, we're supplying
  // this value to the onEnd callback.
  let lastGranulepos = baseGranulepos;

  // Listen on decoder 'stream' events. The argument is a decoder-stream object
  decoder.on('stream', (stream) => {
    // for each "page" event, force the output stream to flush a page of its own.
    // the first time this is emitted there won't have been any "packets" queued
    // yet, but it's nothing to worry about...
    stream.on('page', (page, done) => {
      outStream.flush(done);
    });

    stream.on('packet', (packet, done) => {
      // If this is a B-O-S page, and this is the first file in the stream,
      // just copy the page over to the output. Also emit a page containing
      // Opus tags. We won't use the Opus tags from the source.
      if (packet.b_o_s && baseGranulepos === 0) {
        debug('Writing BOS and tags page');
        // Copy the B-O-S page over
        outStream.packetin(packet);

        // OpusTags packet
        const magicSignature = Buffer.from('OpusTags', 'ascii');
        const vendor = Buffer.from('GroupTalk Sweden AB', 'ascii');
        const vendorLength = Buffer.alloc(4);
        vendorLength.writeUInt32LE(vendor.length, 0);

        const opustags = opusTags(tags);

        const header = Buffer.concat([
          magicSignature,
          vendorLength,
          vendor,
          ...opustags,
        ]);

        const tagsPacket = new OggPacket();
        tagsPacket.packet = header;
        tagsPacket.bytes = header.length;
        tagsPacket.b_o_s = 0;
        tagsPacket.e_o_s = 0;
        tagsPacket.granulepos = 0;
        tagsPacket.flush = true;
        outStream.packetin(tagsPacket, done);
      } else if (packet.granulepos !== 0) {
        const newPacket = new OggPacket();
        // Copy the buffer! If we don't, weird things will happen
        newPacket.packet = Buffer.from(packet.packet);
        newPacket.bytes = packet.bytes;
        newPacket.granulepos = packet.granulepos > 0
          ? packet.granulepos + baseGranulepos
          : packet.granulepos;
        newPacket.e_o_s = writeEos ? packet.e_o_s : 0;
        lastGranulepos = onPacket(newPacket, done);
      }
    });

    stream.on('error', (err) => {
      debug('stream error', err);
    });

    // at the end of each stream, force one last page flush, for any remaining
    // packets in the stream. this ensures the "end" event gets fired properly.
    stream.on('eos', () => {
      outStream.flush((err) => {
        if (err) throw err;
      });
    });

    stream.on('end', () => {
      onEnd(lastGranulepos);
    });
  });

  decoder.on('error', (err) => {
    debug('decoder error', err);
  });

  return decoder;
}

// Write silence to outstream, lasting 'ms' ms, starting at 'granulepos'.
function writeSilence(
  // encoder stream
  outStream,
  // if true, write E-O-S packet
  writeEos,
  // Callback when done building silence packets
  onEnd,
  // Duration of silence
  ms,
  // Starting granule position
  granulepos,
) {
  if (ms <= 0) {
    // We're done!
    onEnd(granulepos);
  } else {
    let remainInPkt = Math.min(MAX_SILENCE_PER_PAGE, ms);
    let msInPacket = 0;
    let newGranulepos = granulepos;

    // We need to write a full OGG packet before waiting for drain, else
    // the encoder will emit a premature packet with granulepos == -1.
    // A full OGG packet is generated by feeding in multiple packets
    // with granulepos == -1 followed by a packet with a positive
    // granulepos (each subpacket is converted into a package segment).
    let needDrain = false;
    while (remainInPkt > 0) {
      const { packet, remaining } = createOpusPacket(remainInPkt);
      msInPacket += remainInPkt - remaining;
      remainInPkt = remaining;
      if (remainInPkt <= 0) {
        // Last segment in this packet, calculate the total
        // granulepos. This will emit a new OGG page.
        newGranulepos += msInPacket * 48;
        packet.granulepos = newGranulepos;
        packet.flush = true;

        // If this is the final silence packet, and we're asked to
        // generate an e_o_s packet, mark it as such.
        // Typically this should never happen in production, as we
        // always end a sound stream with a real sound file.
        if (ms - msInPacket <= 0) {
          packet.e_o_s = writeEos ? 1 : 0;
        }
      }

      // Send the packet
      const ok = outStream.packetin(packet);
      needDrain = needDrain || !ok;
    }

    if (!needDrain) {
      writeSilence(outStream, writeEos, onEnd, ms - msInPacket, newGranulepos);
    } else {
      // Delay next write
      outStream.once('drain', () =>
        writeSilence(outStream, writeEos, onEnd, ms - msInPacket, newGranulepos));
    }
  }
}

// Create a silence decoder
function createSilenceDecoder(ms, outStream, tags, baseGranulepos, onEnd, writeEos) {
  return createDecoder(
    outStream,
    tags,
    baseGranulepos,
    // Handling onEnd differently for silence decoders
    () => null,
    writeEos,
    () => writeSilence(outStream, writeEos, onEnd, ms, baseGranulepos),
  );
}

// Create decoder for a sound file
function createSoundDecoder(outStream, tags, granulepos, onEnd, writeEos) {
  return createDecoder(
    outStream,
    tags,
    granulepos,
    onEnd,
    writeEos,
    (packet, done) => {
      outStream.packetin(packet, done);
      return packet.granulepos;
    },
  );
}

// function waitForWritable(writable, cb) {
//   if (writable.writableLength > 0) {
//     debug('Waiting for encoder...');
//     setTimeout(() => waitForWritable(writable, cb), 20);
//   } else {
//     cb();
//   }
// }

export default function combineFiles(tags, inputs, outputStream, next, audioSource) {
  const encoder = new ogg.Encoder();
  encoder.pipe(outputStream);

  const serial = mkSerial();
  const outStream = encoder.stream(serial);
  outStream.on('done', () => {
    debug('Output decoder stream finished');
  });

  function createDec(index, granulepos) {
    if (index < inputs.length) {
      const input = inputs[index].input || inputs[index].separator;
      if (input) {
        debug(`Starting new stream at pos ${granulepos}`, input);
        const decoder = createSoundDecoder(
          outStream,
          tags,
          granulepos,
          // gp => waitForWritable(outStream, () => createDec(index + 1, gp)),
          gp => createDec(index + 1, gp),
          index === inputs.length - 1,
        );
        if (inputs[index].input) {
          audioSource.stream(decoder, inputs[index].input, next);
        } else {
          audioSource.local(decoder, inputs[index].separator, next);
        }
      } else if (inputs[index].silence) {
        debug(`Starting silence stream at ${granulepos}`, inputs[index].silence);
        const decoder = createSilenceDecoder(
          inputs[index].silence,
          outStream,
          tags,
          granulepos,
          gp => createDec(index + 1, gp),
          index === inputs.length - 1,
        );
        const reader = fs.createReadStream('audio/silence.opus');
        reader.pipe(decoder);
      } else {
        debug(`Bad input! ${inputs[index]}`);
        createDec(index + 1, granulepos);
      }
    }
  }

  createDec(0, 0);
}
