import * as THREE from 'three';

// Cache all non-degenerate edges; range filtering is applied separately.
export function collectPlayableEdges(object) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    const diagonal = box.getSize(new THREE.Vector3()).length();
    const minimum = Math.max(diagonal * 1e-10, Number.EPSILON);
    const segments = [];
    let ignored = 0;
    object.traverse(child => {
        if (!child.isMesh) return;
        const edges = new THREE.EdgesGeometry(child.geometry, 15);
        const positions = edges.attributes.position;
        for (let i = 0; i < positions.count; i += 2) {
            const a = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(child.matrixWorld);
            const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1).applyMatrix4(child.matrixWorld);
            const length = a.distanceTo(b);
            if (!Number.isFinite(length) || length < minimum) { ignored++; continue; }
            segments.push({ a, b, length });
        }
        edges.dispose();
    });
    return { segments, ignored, minimum };
}

export function filterEdgeRange(segments, lower=5, upper=100){
    if(!segments.length) return [];
    const sorted=segments.map(edge=>edge.length).sort((a,b)=>a-b);
    const quantile=percent=>{
        const index=(sorted.length-1)*Math.max(0,Math.min(100,percent))/100;
        const low=Math.floor(index), high=Math.ceil(index);
        return sorted[low]+(sorted[high]-sorted[low])*(index-low);
    };
    const min=quantile(Math.min(lower,upper)), max=quantile(Math.max(lower,upper));
    return segments.filter(edge=>edge.length>=min && edge.length<=max);
}
