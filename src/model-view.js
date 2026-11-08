export function fitModelCamera(camera,box,zUp=false){
    const size=box.getSize(camera.position.clone()).length()||1;
    camera.up.set(0,zUp?0:1,zUp?1:0);
    if(zUp)camera.position.set(size*.85,-size*.95,size*.6);
    else camera.position.set(size*.85,size*.6,size*.95);
    camera.near=Math.max(size/10000,.000001);camera.far=size*100;
    camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
