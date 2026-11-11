//! Optional receiving side of the FEAR-IPC-1 local metadata channel.
//! The host must bind this verifier to one authenticated owned transport;
//! validated data remains metadata only, never physics or inventory authority.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use serde_json::Value;
use std::{collections::HashSet,time::{Duration,Instant}};

type HmacSha256 = Hmac<Sha256>;
#[derive(Debug,Clone,PartialEq,Eq)]
pub enum HostIpcRejection {Closed,Envelope,Authentication,Replay,RateLimited,
    FrameTooLarge,InvalidPayload,ForbiddenEvent,ForbiddenEntity,TickMismatch}
#[derive(Debug,Clone,PartialEq)]
pub enum HostIpcFrame {
    Event { event_type:String,tick:u64,details:Value },
    Cargo { entity_id:String,cargo:Value },
}
#[derive(Debug,Clone)]
pub struct HostIpcPolicy {
    pub event_types:HashSet<String>,pub entity_ids:HashSet<String>,
    pub max_messages:u32,pub max_frame_bytes:usize,pub max_window_bytes:usize,
    pub window:Duration,
}
impl Default for HostIpcPolicy {
    fn default()->Self {Self{event_types:HashSet::new(),entity_ids:HashSet::new(),
        max_messages:32,max_frame_bytes:262144,max_window_bytes:1048576,
        window:Duration::from_millis(1000)}}
}
pub struct HostIpcReceiver {
    session:String,key:[u8;32],policy:HostIpcPolicy,sequence:u64,
    started:Instant,attempts:u32,admitted:u32,bytes:usize,closed:bool,
}
impl Drop for HostIpcReceiver {fn drop(&mut self){self.close()}}
impl HostIpcReceiver {
    pub fn new(session:&str,secret:&str,policy:HostIpcPolicy)->Result<Self,HostIpcRejection>{
        fn is_hex(s:&str,len:usize)->bool {s.len()==len && s.bytes()
            .all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))}
        if !is_hex(session,32)||!is_hex(secret,64)||policy.max_messages==0||
            policy.max_messages>1024||policy.max_frame_bytes==0||
            policy.max_frame_bytes>1048576||
            policy.max_window_bytes<policy.max_frame_bytes||
            policy.max_window_bytes>67108864||
            policy.window<Duration::from_millis(10)||
            policy.window>Duration::from_secs(60)||
            policy.event_types.len()>256||policy.entity_ids.len()>256||
            policy.event_types.iter().chain(policy.entity_ids.iter())
                .any(|s|s.is_empty()||s.len()>256) {
            return Err(HostIpcRejection::Envelope)
        }
        let mut key=[0u8;32];
        for (i,pair) in secret.as_bytes().chunks_exact(2).enumerate() {
            key[i]=u8::from_str_radix(std::str::from_utf8(pair).unwrap(),16)
                .map_err(|_|HostIpcRejection::Envelope)?;
        }
        Ok(Self{session:session.to_owned(),key,policy,sequence:0,
            started:Instant::now(),attempts:0,admitted:0,bytes:0,closed:false})
    }
    pub fn close(&mut self){self.key.fill(0);self.closed=true;}
    pub fn last_sequence(&self)->u64{self.sequence}
    pub fn admitted_bytes(&self)->usize{self.bytes}
    pub fn receive(&mut self,packet:&str,current_tick:u64)->
        Result<HostIpcFrame,HostIpcRejection> {
        use HostIpcRejection as R;
        if self.closed{return Err(R::Closed)}
        if self.started.elapsed()>=self.policy.window {
            self.started=Instant::now();self.attempts=0;self.admitted=0;self.bytes=0;
        }
        self.attempts+=1;
        if self.attempts>self.policy.max_messages.saturating_mul(8).saturating_add(8)
            {return Err(R::RateLimited)}
        if packet.len()>1400000||!packet.is_ascii(){return Err(R::Envelope)}
        // Never materialize an unbounded number of attacker-chosen fields.
        let parts:Vec<_>=packet.splitn(6,'.').collect();
        if parts.len()!=5||parts[0]!="FEAR-IPC-1"||parts[1]!=self.session||
            parts[2].is_empty()||parts[2].starts_with('0')||parts[2].len()>16||
            !parts[2].bytes().all(|c|c.is_ascii_digit())||
            parts[4].len()!=64||!parts[4].bytes().all(|c|
                c.is_ascii_digit()||(b'a'..=b'f').contains(&c)) {return Err(R::Envelope)}
        let seq=parts[2].parse::<u64>().map_err(|_|R::Envelope)?;
        if seq>9007199254740991{return Err(R::Envelope)}
        let signed=packet.rsplit_once('.').unwrap().0;
        let mut mac=HmacSha256::new_from_slice(&self.key).map_err(|_|R::Authentication)?;
        mac.update(signed.as_bytes());
        let mut tag=[0u8;32];
        for (i,pair) in parts[4].as_bytes().chunks_exact(2).enumerate(){
            tag[i]=u8::from_str_radix(std::str::from_utf8(pair).unwrap(),16)
                .map_err(|_|R::Envelope)?;
        }
        mac.verify_slice(&tag).map_err(|_|R::Authentication)?;
        if seq!=self.sequence+1{return Err(R::Replay)}
        if self.admitted>=self.policy.max_messages{return Err(R::RateLimited)}
        let encoded=parts[3];
        if encoded.len()%4==1||!encoded.bytes().all(|c|
            c.is_ascii_alphanumeric()||c==b'-'||c==b'_'){
            self.sequence=seq;self.admitted+=1;return Err(R::InvalidPayload)
        }
        let bound=encoded.len()*3/4;
        if bound>self.policy.max_frame_bytes {
            self.sequence=seq;self.admitted+=1;return Err(R::FrameTooLarge)
        }
        if self.bytes+bound>self.policy.max_window_bytes{return Err(R::RateLimited)}
        self.sequence=seq;self.admitted+=1;self.bytes+=bound;
        let raw=URL_SAFE_NO_PAD.decode(encoded).map_err(|_|R::InvalidPayload)?;
        let json=std::str::from_utf8(&raw).map_err(|_|R::InvalidPayload)?;
        if json.encode_utf16().count()>262144{return Err(R::FrameTooLarge)}
        let data:Value=serde_json::from_str(json).map_err(|_|R::InvalidPayload)?;
        check_graph(&data)?;
        let obj=data.as_object().ok_or(R::InvalidPayload)?;
        if obj.get("version").and_then(Value::as_u64)!=Some(1)
            {return Err(R::InvalidPayload)}
        let shape=|wanted:&[&str]|obj.len()==wanted.len()&&
            obj.keys().all(|k|wanted.contains(&k.as_str()));
        match obj.get("kind").and_then(Value::as_str){
            Some("event") if shape(&["version","kind","type","tick","details"])=>{
                let event=obj["type"].as_str().filter(|v|!v.is_empty()).ok_or(R::InvalidPayload)?;
                let tick=obj["tick"].as_u64().ok_or(R::InvalidPayload)?;
                if !obj["details"].is_object(){return Err(R::InvalidPayload)}
                if tick!=current_tick{return Err(R::TickMismatch)}
                if !self.policy.event_types.contains(event){return Err(R::ForbiddenEvent)}
                Ok(HostIpcFrame::Event{event_type:event.to_string(),tick,
                    details:obj["details"].clone()})
            }
            Some("cargo") if shape(&["version","kind","entityId","cargo"])=>{
                let id=obj["entityId"].as_str().filter(|v|!v.is_empty()&&v.len()<=256)
                    .ok_or(R::InvalidPayload)?;
                if !obj["cargo"].is_object(){return Err(R::InvalidPayload)}
                if id.starts_with("trade:")||!self.policy.entity_ids.contains(id)
                    {return Err(R::ForbiddenEntity)}
                Ok(HostIpcFrame::Cargo{entity_id:id.to_string(),cargo:obj["cargo"].clone()})
            }
            _=>Err(R::InvalidPayload)
        }
    }
}
fn check_graph(value:&Value)->Result<(),HostIpcRejection>{
    let mut pending=vec![(value,0usize)];let mut count=0usize;
    while let Some((v,depth))=pending.pop(){
        count+=1;if count>4096||depth>32{return Err(HostIpcRejection::InvalidPayload)}
        match v{
            Value::Object(map)=>{
                if map.len()>256{return Err(HostIpcRejection::InvalidPayload)}
                for (k,val) in map {
                    if ["__proto__","prototype","constructor","toJSON"].contains(&k.as_str())
                        ||k.encode_utf16().count()>16384{return Err(HostIpcRejection::InvalidPayload)}
                    pending.push((val,depth+1));
                }
            }
            Value::Array(list)=>{
                if list.len()>2048{return Err(HostIpcRejection::InvalidPayload)}
                for val in list {pending.push((val,depth+1))}
            }
            Value::String(s) if s.encode_utf16().count()>16384=>
                return Err(HostIpcRejection::InvalidPayload),
            _=>{}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn policy()->HostIpcPolicy {
        let mut p=HostIpcPolicy::default();
        p.event_types.insert("host_signal".to_string());
        p.entity_ids.insert("neutral".to_string());
        p.max_messages=2;p.max_frame_bytes=256;p.max_window_bytes=400;p
    }
    fn sign(seq:u64,frame:&str,secret:&str,session:&str)->String {
        let payload=URL_SAFE_NO_PAD.encode(frame);
        let signed=format!("FEAR-IPC-1.{session}.{seq}.{payload}");
        let key:Vec<u8>=secret.as_bytes().chunks_exact(2).map(|p|
            u8::from_str_radix(std::str::from_utf8(p).unwrap(),16).unwrap()).collect();
        let mut mac=HmacSha256::new_from_slice(&key).unwrap();
        mac.update(signed.as_bytes());
        let tag:String=mac.finalize().into_bytes().iter().map(|b|format!("{b:02x}")).collect();
        format!("{signed}.{tag}")
    }
    #[test]
    fn node_python_csharp_unity_vector_and_replay() {
        let session="ab".repeat(16);let secret="cd".repeat(32);
        let event=r#"{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{"note":"cross-language"}}"#;
        let first=sign(1,event,&secret,&session);
        assert_eq!(first,"FEAR-IPC-1.abababababababababababababababab.1.eyJ2ZXJzaW9uIjoxLCJraW5kIjoiZXZlbnQiLCJ0eXBlIjoiaG9zdF9zaWduYWwiLCJ0aWNrIjowLCJkZXRhaWxzIjp7Im5vdGUiOiJjcm9zcy1sYW5ndWFnZSJ9fQ.ba1abb27860cd4cdb0882bc5a776e74872bad31f349dc6a669801089a9f6f523");
        let mut receiver=HostIpcReceiver::new(&session,&secret,policy()).unwrap();
        assert!(matches!(receiver.receive(&first,0),Ok(HostIpcFrame::Event{..})));
        assert_eq!(receiver.receive(&first,0),Err(HostIpcRejection::Replay));
        assert_eq!(receiver.receive(&sign(2,event,&"ef".repeat(32),&session),0),
            Err(HostIpcRejection::Authentication));
        assert_eq!(receiver.receive(&sign(3,event,&secret,&session),0),
            Err(HostIpcRejection::Replay));
        assert!(matches!(receiver.receive(&sign(2,event,&secret,&session),0),
            Ok(HostIpcFrame::Event{..})));
        assert_eq!(receiver.receive(&sign(3,event,&secret,&session),0),
            Err(HostIpcRejection::RateLimited));
        receiver.close();
        assert_eq!(receiver.receive(&first,0),Err(HostIpcRejection::Closed));
    }
    #[test]
    fn rejects_forbidden_metadata_and_trade_authority() {
        let session="12".repeat(16);let secret="34".repeat(32);
        let mut receiver=HostIpcReceiver::new(&session,&secret,policy()).unwrap();
        let bad=r#"{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{"toJSON":1}}"#;
        assert_eq!(receiver.receive(&sign(1,bad,&secret,&session),0),
            Err(HostIpcRejection::InvalidPayload));
        let cargo=r#"{"version":1,"kind":"cargo","entityId":"trade:shipment","cargo":{}}"#;
        assert_eq!(receiver.receive(&sign(2,cargo,&secret,&session),0),
            Err(HostIpcRejection::ForbiddenEntity));
    }
    #[test]
    fn limits_frames_and_sequence_before_decode() {
        let session="56".repeat(16);let secret="78".repeat(32);
        let mut p=policy();p.max_frame_bytes=128;p.max_window_bytes=180;
        let mut receiver=HostIpcReceiver::new(&session,&secret,p).unwrap();
        let prefix=r#"{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{"n":""#;
        let suffix=r#""}}"#;
        let make=|len:usize|format!("{}{}{}",prefix,"x".repeat(len-prefix.len()-suffix.len()),suffix);
        assert_eq!(make(128).len(),128);
        assert!(receiver.receive(&sign(1,&make(128),&secret,&session),0).is_ok());
        assert_eq!(receiver.receive(&sign(2,&make(129),&secret,&session),0),
            Err(HostIpcRejection::FrameTooLarge));
        assert_eq!(receiver.last_sequence(),2);
        assert_eq!(receiver.receive(&sign(2,&make(128),&secret,&session),0),
            Err(HostIpcRejection::Replay));
        let smaller=r#"{"version":1,"kind":"event","type":"host_signal","tick":0,"details":{}}"#;
        assert_eq!(receiver.receive(&sign(3,smaller,&secret,&session),0),
            Err(HostIpcRejection::RateLimited));
        assert_eq!(receiver.last_sequence(),2);
    }
}
