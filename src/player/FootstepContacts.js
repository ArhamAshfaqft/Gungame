// Contact thresholds come from sampling each final retargeted animation. Runtime
// detection reads the displayed feet, so transitions and playback speed also count.
export class FootstepContacts {
    constructor(emit) { this.emit=emit; this.time=0; this.lastStep=-Infinity; this.feet={Left:{},Right:{}}; }
    reset() { for(const foot of Object.values(this.feet)){foot.lifted=false;foot.height=null;} }
    update(delta,{heights,range,speed=0,grounded=true,sliding=false,disabled=false}={}) {
        if(delta<=0)return;
        this.time+=delta;
        if(!range || !heights || !grounded || sliding || disabled || speed<.2){this.reset();return;}
        for(const side of ['Left','Right']) {
            const foot=this.feet[side],bounds=range[side],height=heights[side];
            if(!bounds || !Number.isFinite(height)){foot.lifted=false;foot.height=null;continue;}
            if(foot.min===undefined){foot.min=bounds.min;foot.max=bounds.max;}
            const blend=1-Math.exp(-delta*18);
            foot.min+=(bounds.min-foot.min)*blend;foot.max+=(bounds.max-foot.max)*blend;
            const span=Math.max(.025,foot.max-foot.min);
            if(height>foot.min+span*.35)foot.lifted=true;
            const descending=foot.height!==null && height<foot.height-.00001;
            if(foot.lifted && descending && height<=foot.min+span*.12 && this.time-(foot.lastStep??-Infinity)>.16 && this.time-this.lastStep>.065){
                foot.lifted=false;foot.lastStep=this.lastStep=this.time;this.emit(side);
            }
            foot.height=height;
        }
    }
}
