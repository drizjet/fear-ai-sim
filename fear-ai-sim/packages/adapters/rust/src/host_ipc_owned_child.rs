//! Opt-in FEAR-IPC-1 stdout transport for a process launched by this owner.
//! One LF-delimited signed envelope per line. This is not the middleware socket.
//! No bytes from the child acquire simulation authority without HostIpcReceiver.
use crate::host_ipc_receiver::{HostIpcFrame, HostIpcPolicy, HostIpcReceiver, HostIpcRejection};
use std::collections::VecDeque;
use std::io::{self, Read};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostIpcTransportFault {
    QueueFull,
    WireTooLarge,
    InvalidEncoding,
    TruncatedLine,
    ReadFailure,
}

#[derive(Debug)]
pub enum HostIpcChildError {
    InvalidPolicy,
    Launch(io::Error),
    Closed,
    Disconnected,
    Transport(HostIpcTransportFault),
    Rejected(HostIpcRejection),
}

#[derive(Debug, Clone, Copy)]
pub struct HostIpcQueueLimits {
    /// Includes the signed envelope, not only its decoded JSON body.
    pub max_wire_bytes: usize,
    pub max_queued_messages: usize,
    pub max_queued_bytes: usize,
}

impl Default for HostIpcQueueLimits {
    fn default() -> Self {
        Self { max_wire_bytes: 1_400_000, max_queued_messages: 16,
            max_queued_bytes: 4_200_000 }
    }
}

impl HostIpcQueueLimits {
    fn valid(self) -> bool {
        (80..=1_400_000).contains(&self.max_wire_bytes)
            && (1..=1024).contains(&self.max_queued_messages)
            && self.max_queued_bytes >= self.max_wire_bytes
            && self.max_queued_bytes <= 16_777_216
    }
}

#[derive(Default)]
struct Inbox {
    packets: VecDeque<Vec<u8>>,
    bytes: usize,
    fault: Option<HostIpcTransportFault>,
    eof: bool,
    cancelled: bool,
}

fn mark_fault(shared: &Arc<Mutex<Inbox>>, fault: HostIpcTransportFault) {
    let mut state = shared.lock().expect("private FEAR-IPC inbox mutex poisoned");
    state.fault.get_or_insert(fault);
}

// Only this thread reads the owned child's stdout. Never use read_to_end or
// read_line: both can buffer an unbounded pre-authentication line.
fn read_frames(mut output: impl Read, shared: Arc<Mutex<Inbox>>, limits: HostIpcQueueLimits) {
    let mut read_buffer = [0u8; 4096];
    let mut current = Vec::new();
    loop {
        let count = match output.read(&mut read_buffer) {
            Ok(n) => n,
            Err(_) => { mark_fault(&shared, HostIpcTransportFault::ReadFailure); return; }
        };
        if count == 0 {
            if !current.is_empty() {
                mark_fault(&shared, HostIpcTransportFault::TruncatedLine);
            }
            shared.lock().expect("private FEAR-IPC inbox mutex poisoned").eof = true;
            return;
        }
        if shared.lock().expect("private FEAR-IPC inbox mutex poisoned").cancelled {
            return;
        }
        for &byte in &read_buffer[..count] {
            if byte == b'\n' {
                if current.last() == Some(&b'\r') { current.pop(); }
                let size = current.len();
                let mut state = shared.lock().expect("private FEAR-IPC inbox mutex poisoned");
                if state.cancelled { return; }
                if state.packets.len() >= limits.max_queued_messages
                    || state.bytes.checked_add(size).map_or(true, |total| total > limits.max_queued_bytes)
                {
                    state.fault = Some(HostIpcTransportFault::QueueFull);
                    return;
                }
                state.bytes += size;
                state.packets.push_back(std::mem::take(&mut current));
            } else {
                if current.len() >= limits.max_wire_bytes {
                    mark_fault(&shared, HostIpcTransportFault::WireTooLarge);
                    return;
                }
                current.push(byte);
            }
        }
    }
}

/// Owns one launched child and only its piped stdout. This is deliberately not
/// a general TCP listener: process ownership is established by Command::spawn.
/// External callers must generate new OS-random credentials for each launch.
pub struct HostIpcOwnedChild {
    child: Option<Child>,
    reader: Option<thread::JoinHandle<()>>,
    inbox: Arc<Mutex<Inbox>>,
    receiver: HostIpcReceiver,
}

impl HostIpcOwnedChild {
    /// An opt-in, newline-framed local transport. Credential variables are
    /// supplied only to the newly spawned child, never to middleware sockets.
    /// Do not reuse the credential arguments when launching a replacement.
    pub fn spawn(
        command: &mut Command, session: &str, secret: &str,
        policy: HostIpcPolicy, limits: HostIpcQueueLimits,
    ) -> Result<Self, HostIpcChildError> {
        if !limits.valid() { return Err(HostIpcChildError::InvalidPolicy); }
        let receiver = HostIpcReceiver::new(session, secret, policy)
            .map_err(HostIpcChildError::Rejected)?;
        command.stdin(Stdio::null()).stderr(Stdio::null()).stdout(Stdio::piped());
        command.env("FEAR_HOST_IPC_SESSION", session);
        command.env("FEAR_HOST_IPC_SECRET", secret);
        // Do not retain credentials inside a reusable caller-owned Command.
        let launched = command.spawn();
        command.env_remove("FEAR_HOST_IPC_SESSION");
        command.env_remove("FEAR_HOST_IPC_SECRET");
        let mut child = launched.map_err(HostIpcChildError::Launch)?;
        let stdout = child.stdout.take().expect("piped child stdout");
        let inbox = Arc::new(Mutex::new(Inbox::default()));
        let shared = Arc::clone(&inbox);
        let reader = thread::spawn(move || read_frames(stdout, shared, limits));
        Ok(Self { child: Some(child), reader: Some(reader), inbox, receiver })
    }

    /// Non-blocking delivery. An upstream flood poisons the entire transport;
    /// queued items are not applied after overflow, even if signed correctly.
    /// A valid frame is still advisory metadata, not a gameplay command.
    pub fn poll(&mut self, current_tick: u64) -> Result<Option<HostIpcFrame>, HostIpcChildError> {
        if self.child.is_none() { return Err(HostIpcChildError::Closed); }
        let (fault, packet, eof) = {
            let mut state = self.inbox.lock().expect("private FEAR-IPC inbox mutex poisoned");
            let fault = state.fault;
            let packet = if fault.is_none() { state.packets.pop_front() } else { None };
            if let Some(ref bytes) = packet { state.bytes -= bytes.len(); }
            (fault, packet, state.eof)
        };
        if let Some(fault) = fault {
            self.close();
            return Err(HostIpcChildError::Transport(fault));
        }
        if let Some(bytes) = packet {
            let packet = match std::str::from_utf8(&bytes) {
                Ok(packet) => packet,
                Err(_) => {
                    // Invalid byte streams cannot bypass the verifier's
                    // per-window attempt budget with unlimited retries.
                    self.close();
                    return Err(HostIpcChildError::Transport(
                        HostIpcTransportFault::InvalidEncoding));
                }
            };
            return self.receiver.receive(packet, current_tick)
                .map(Some).map_err(HostIpcChildError::Rejected);
        }
        if eof {
            self.close();
            return Err(HostIpcChildError::Disconnected);
        }
        Ok(None)
    }

    pub fn queued(&self) -> (usize, usize) {
        let state = self.inbox.lock().expect("private FEAR-IPC inbox mutex poisoned");
        (state.packets.len(), state.bytes)
    }

    /// Kill/reap only the child spawned by this instance, revoke key material,
    /// and discard all queued signed/unsigned input. Never kill a foreign PID.
    pub fn close(&mut self) {
        self.receiver.close();
        self.inbox.lock().expect("private FEAR-IPC inbox mutex poisoned").cancelled = true;
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // The pipe reader may inherit a still-open handle from a child-created
        // descendant. Do not block indefinitely joining it during shutdown.
        if let Some(handle) = self.reader.take() {
            if handle.is_finished() { let _ = handle.join(); }
        }
        let mut state = self.inbox.lock().expect("private FEAR-IPC inbox mutex poisoned");
        state.packets.clear();
        state.bytes = 0;
    }
}

impl Drop for HostIpcOwnedChild { fn drop(&mut self) { self.close(); } }

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use std::time::{Duration, Instant};

    fn signed(session: &str, secret: &str, sequence: u64) -> String {
        let frame = r#"{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{}}"#;
        let prefix = format!("FEAR-IPC-1.{session}.{sequence}.{}", URL_SAFE_NO_PAD.encode(frame));
        let key: Vec<u8> = secret.as_bytes().chunks_exact(2).map(|p|
            u8::from_str_radix(std::str::from_utf8(p).unwrap(), 16).unwrap()).collect();
        let mut mac = Hmac::<Sha256>::new_from_slice(&key).unwrap();
        mac.update(prefix.as_bytes());
        let digest: String = mac.finalize().into_bytes().iter().map(|v| format!("{v:02x}")).collect();
        format!("{prefix}.{digest}")
    }
    fn policy() -> HostIpcPolicy {
        let mut p = HostIpcPolicy::default();
        p.event_types.insert("host_signal".to_owned());
        p
    }
    fn echo_command(lines: &[String]) -> Command {
        #[cfg(windows)] {
            let mut cmd = Command::new("cmd.exe");
            cmd.arg("/D").arg("/C").arg(lines.iter().map(|v| format!("echo {v}"))
                .collect::<Vec<_>>().join("&"));
            cmd
        }
        #[cfg(not(windows))] {
            let mut cmd = Command::new("sh");
            cmd.arg("-c").arg(lines.iter().map(|v| format!("printf '%s\\n' '{v}'"))
                .collect::<Vec<_>>().join("; "));
            cmd
        }
    }
    fn partial_command() -> Command {
        #[cfg(windows)] {
            let mut cmd = Command::new("cmd.exe");
            cmd.arg("/D").arg("/C").arg("<nul set /p =partial");
            cmd
        }
        #[cfg(not(windows))] {
            let mut cmd = Command::new("sh");
            cmd.arg("-c").arg("printf %s partial");
            cmd
        }
    }
    fn await_result(child: &mut HostIpcOwnedChild) -> Result<HostIpcFrame, HostIpcChildError> {
        let start = Instant::now();
        loop {
            match child.poll(0) {
                Ok(Some(frame)) => return Ok(frame),
                Ok(None) if start.elapsed() < Duration::from_secs(3) =>
                    thread::sleep(Duration::from_millis(5)),
                Ok(None) => panic!("owned child did not produce a frame in time"),
                Err(e) => return Err(e),
            }
        }
    }
    #[test]
    fn owned_child_accepts_only_verified_metadata_then_revokes() {
        let session = "ab".repeat(16); let secret = "cd".repeat(32);
        let mut command = echo_command(&[signed(&session, &secret, 1)]);
        let mut owned = HostIpcOwnedChild::spawn(&mut command, &session, &secret,
            policy(), HostIpcQueueLimits::default()).unwrap();
        assert!(matches!(await_result(&mut owned), Ok(HostIpcFrame::Event { .. })));
        owned.close();
        assert!(matches!(owned.poll(0), Err(HostIpcChildError::Closed)));
        assert_eq!(owned.queued(), (0, 0));
    }
    #[test]
    fn queue_overload_poisoned_before_any_gameplay_delivery() {
        let session = "01".repeat(16); let secret = "ef".repeat(32);
        let packet = signed(&session, &secret, 1);
        let mut command = echo_command(&[packet.clone(), packet.clone(), packet]);
        let limits = HostIpcQueueLimits { max_wire_bytes: 512,
            max_queued_messages: 1, max_queued_bytes: 512 };
        let mut owned = HostIpcOwnedChild::spawn(&mut command, &session, &secret,
            policy(), limits).unwrap();
        let start = Instant::now();
        while owned.inbox.lock().unwrap().fault.is_none() {
            assert!(start.elapsed() < Duration::from_secs(3), "backpressure did not engage");
            thread::sleep(Duration::from_millis(5));
        }
        assert!(matches!(owned.poll(0), Err(HostIpcChildError::Transport(
            HostIpcTransportFault::QueueFull))));
        assert_eq!(owned.queued(), (0, 0));
    }
    #[test]
    fn rejects_oversized_pre_auth_line_and_old_session_at_new_owner() {
        let session = "12".repeat(16); let secret = "34".repeat(32);
        let mut command = echo_command(&["x".repeat(200)]);
        let limits = HostIpcQueueLimits { max_wire_bytes: 128,
            max_queued_messages: 1, max_queued_bytes: 128 };
        let mut owned = HostIpcOwnedChild::spawn(&mut command, &session, &secret,
            policy(), limits).unwrap();
        let start = Instant::now();
        while owned.inbox.lock().unwrap().fault.is_none() {
            assert!(start.elapsed() < Duration::from_secs(3), "oversized line not rejected");
            thread::sleep(Duration::from_millis(5));
        }
        assert!(matches!(owned.poll(0), Err(HostIpcChildError::Transport(
            HostIpcTransportFault::WireTooLarge))));
        let mut next_command = echo_command(&[signed(&session, &secret, 1)]);
        let new_session = "56".repeat(16); let new_secret = "78".repeat(32);
        let mut next = HostIpcOwnedChild::spawn(&mut next_command, &new_session,
            &new_secret, policy(), HostIpcQueueLimits::default()).unwrap();
        assert!(matches!(await_result(&mut next), Err(HostIpcChildError::Rejected(
            HostIpcRejection::Envelope))));
    }

    #[test]
    fn owned_stream_preserves_replay_and_tamper_refusal() {
        let session = "99".repeat(16); let secret = "aa".repeat(32);
        let fake = signed(&session, &"bb".repeat(32), 1);
        let one = signed(&session, &secret, 1);
        let two = signed(&session, &secret, 2);
        let mut command = echo_command(&[fake, one.clone(), one, two]);
        let mut owned = HostIpcOwnedChild::spawn(&mut command, &session, &secret,
            policy(), HostIpcQueueLimits::default()).unwrap();
        assert!(matches!(await_result(&mut owned), Err(HostIpcChildError::Rejected(
            HostIpcRejection::Authentication))));
        assert!(matches!(await_result(&mut owned), Ok(HostIpcFrame::Event { .. })));
        assert!(matches!(await_result(&mut owned), Err(HostIpcChildError::Rejected(
            HostIpcRejection::Replay))));
        assert!(matches!(await_result(&mut owned), Ok(HostIpcFrame::Event { .. })));
    }

    #[test]
    fn incomplete_child_line_is_not_delivered_after_process_exit() {
        let session = "a1".repeat(16); let secret = "b2".repeat(32);
        let mut command = partial_command();
        let mut owned = HostIpcOwnedChild::spawn(&mut command, &session, &secret,
            policy(), HostIpcQueueLimits::default()).unwrap();
        assert!(matches!(await_result(&mut owned), Err(HostIpcChildError::Transport(
            HostIpcTransportFault::TruncatedLine))));
        assert_eq!(owned.queued(), (0, 0));
    }
}
