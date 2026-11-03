import * as THREE from 'three';

export const seededRandom = seed => {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
};

// Convex Voronoi cells: neighboring pieces share exact edges instead of square tile seams.
export function fractureCells(width, height, cols, rows, seed = 7, impact = null) {
    const random = seededRandom(seed);
    const seeds = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            seeds.push(new THREE.Vector2((col + 0.5 + (random() - 0.5) * 0.8) * width / cols,
                (row + 0.5 + (random() - 0.5) * 0.8) * height / rows));
        }
    }
    if (impact) {
        let closest = 0;
        seeds.forEach((point, i) => { if (point.distanceToSquared(impact) < seeds[closest].distanceToSquared(impact)) closest = i; });
        seeds[closest].copy(impact).clamp(new THREE.Vector2(0.001, 0.001), new THREE.Vector2(width - 0.001, height - 0.001));
    }
    return seeds.map((center, id) => {
        let polygon = [new THREE.Vector2(0, 0), new THREE.Vector2(width, 0), new THREE.Vector2(width, height), new THREE.Vector2(0, height)];
        for (let j = 0; j < seeds.length && polygon.length; j++) {
            if (j === id) continue;
            const normal = seeds[j].clone().sub(center);
            const distance = (seeds[j].lengthSq() - center.lengthSq()) / 2;
            const clipped = [];
            for (let k = 0; k < polygon.length; k++) {
                const a = polygon[k], b = polygon[(k + 1) % polygon.length];
                const da = a.dot(normal) - distance, db = b.dot(normal) - distance;
                if (da <= 1e-9) clipped.push(a);
                if ((da < 0 && db > 0) || (da > 0 && db < 0)) clipped.push(a.clone().lerp(b, da / (da - db)));
            }
            polygon = clipped;
        }
        const bounds = new THREE.Box2().setFromPoints(polygon);
        return { id, center, polygon, bounds };
    });
}

export function timberCells(width,height,boardWidth=.2,span=.65){
 const cols=Math.ceil(width/boardWidth),rows=Math.ceil(height/span),pieces=[],random=seededRandom(107);
 for(let col=0;col<cols;col++){
  const x0=width*col/cols,x1=width*(col+1)/cols,ends=Array.from({length:rows+1},(_,r)=>r===0||r===rows?0:(random()-.5)*.08);
  for(let row=0;row<rows;row++){
   const a=height*row/rows,b=height*(row+1)/rows,polygon=[new THREE.Vector2(x0,a),new THREE.Vector2(x1,a+ends[row]),new THREE.Vector2(x1,b+ends[row+1]),new THREE.Vector2(x0,b)];
   pieces.push({id:pieces.length,board:col,row,polygon,center:new THREE.Vector2((x0+x1)/2,(a+b)/2),bounds:new THREE.Box2().setFromPoints(polygon)});
  }
 }
 return pieces;
}
export function createFracturedPanel(width, height, thickness, material, cols = 8, rows = 16, cells=null) {
    const pieces = cells||fractureCells(width, height, cols, rows, 107);
    const positions = [], normals = [], uvs = [], colors = [], facePieces = [];
    const triangle = (a, b, c, normal, piece, edge = false) => {
        for (const point of [a, b, c]) {
            positions.push(...point);
            normals.push(...normal);
            uvs.push(point[0] / width * 2.5, point[1] / height);
            colors.push(...(edge ? [0.64, 0.43, 0.25] : [1, 1, 1]));
        }
        facePieces.push(piece.id);
    };
    for (const piece of pieces) {
        piece.start = positions.length / 3;
        const p = piece.polygon;
        for (let i = 1; i < p.length - 1; i++) {
            triangle([p[0].x, p[0].y, thickness / 2], [p[i].x, p[i].y, thickness / 2], [p[i + 1].x, p[i + 1].y, thickness / 2], [0, 0, 1], piece);
            triangle([p[0].x, p[0].y, -thickness / 2], [p[i + 1].x, p[i + 1].y, -thickness / 2], [p[i].x, p[i].y, -thickness / 2], [0, 0, -1], piece);
        }
        for (let i = 0; i < p.length; i++) {
            const a = p[i], b = p[(i + 1) % p.length];
            const n = new THREE.Vector3(b.y - a.y, a.x - b.x, 0).normalize().toArray();
            triangle([a.x, a.y, -thickness / 2], [b.x, b.y, -thickness / 2], [b.x, b.y, thickness / 2], n, piece, true);
            triangle([a.x, a.y, -thickness / 2], [b.x, b.y, thickness / 2], [a.x, a.y, thickness / 2], n, piece, true);
        }
        piece.count = positions.length / 3 - piece.start;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
    geometry.index.setUsage(THREE.DynamicDrawUsage);
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    const raycast = mesh.raycast.bind(mesh);
    mesh.raycast = (ray, hits) => {
        const first = hits.length;
        raycast(ray, hits);
        for (let i = first; i < hits.length; i++) hits[i].instanceId = (mesh.userData.fractureFacePieces||facePieces)[hits[i].faceIndex];
    };
    return { mesh, pieces };
}
