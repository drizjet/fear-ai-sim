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
