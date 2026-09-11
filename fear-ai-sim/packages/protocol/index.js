/**
 * @fear-ai/protocol - Wire protocol, schemas, and validators for Fear AI middleware.
 */

export {
    PROTOCOL_VERSION,
    MESSAGE_TYPES,
    STIMULUS_TYPES,
    ERROR_CODES,
    OPTIONAL_MODULES
} from './src/types.js';

export {
    HANDSHAKE_REQUEST_SCHEMA,
    REGISTER_AGENT_SCHEMA,
    STIMULUS_SCHEMA,
    OBSERVATION_DISPATCH_SCHEMA,
    BATCH_TICK_REQUEST_SCHEMA,
    AGENT_STATE_OUTPUT_SCHEMA
} from './src/schemas.js';

export { ProtocolValidator } from './src/validator.js';

export { runAdapterConformance, canonicalAdapterSample } from './src/AdapterConformance.js';

export {
    BinaryWireProtocol,
    BinaryFrameReader,
    BINARY_MAGIC,
    BINARY_PROTOCOL_VERSION,
    FRAME_TYPES,
    INTENT_CODES,
    POSTURE_CODES,
    BAND_CODES
} from './src/BinaryWireProtocol.js';

export {
    StreamingRingBuffer,
    PacketChunker,
    ChunkAssembler,
    FrameDeltaCompressor,
    JitterPlaybackBuffer,
    STREAMING_MAGIC,
    STREAMING_PROTOCOL_VERSION,
    DEFAULT_MTU_BYTES,
    CHUNK_HEADER_SIZE_BYTES,
    OVERFLOW_STRATEGIES,
    CHUNK_FLAGS,
    DELTA_FIELD_FLAGS,
    computeFletcher16
} from './src/StreamingFrameBuffer.js';

