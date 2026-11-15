// Counts only: never retain SDP, IP addresses, ports, credentials or candidates.
export function candidateTypes(description){
 const counts={host:0,srflx:0,prflx:0,relay:0};
 for(const match of (description?.sdp||'').matchAll(/^a=candidate:.*?\styp\s+(host|srflx|prflx|relay)(?:\s|$)/gm))counts[match[1]]++;
 return counts;
}
export function updateConnectionDetails(info,rtc){
 if(!rtc)return;
 info.remoteAnswer=!!rtc.remoteDescription;
 info.gatheringState=rtc.iceGatheringState||'unknown';
 info.peerState=rtc.connectionState||'unknown';
 info.localTypes=candidateTypes(rtc.localDescription);
 info.remoteTypes=candidateTypes(rtc.remoteDescription);
}
