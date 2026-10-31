const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const copy = value => JSON.parse(JSON.stringify(value));
const address = {countryCode:'in',country:'India',cityId:4380870,city:'Delhi',street:'Sample Road',flat:'4B',postalCode:''};
const cart = {total:72,tax:12,items:[{sku:'STAN-1',qty:1,price:67,subtotal:67},{sku:'SHIP',qty:1,price:5,subtotal:5}]};
function setup(controller) {
    const controllers={}, factories={}, requests=[], timers=[];
    const app={config:()=>app,run:()=>app,controller:(name,def)=>{controllers[name]=def;return app;},factory:(name,def)=>{factories[name]=def;return app;}};
    const angular={module:()=>app,copy};
    const context={window:{angular},console,Number,Intl,Date};
    for(const file of ['controller.js','checkout.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/js',file),'utf8'),context);
    const state=factories.checkoutState();
    const scope={$on:()=>{}};
    const user={uniqueid:'test-user',cart:copy(cart),save:()=>{}};
    const timeout=fn=>{const timer={fn,active:true};timers.push(timer);return timer;};timeout.cancel=timer=>{if(timer)timer.active=false;};
    const http={};for(const method of ['get','post'])http[method]=(url,body)=>new Promise((resolve,reject)=>requests.push({method,url,body,resolve,reject}));
    const location={url:value=>{location.value=value;}};
    const deps={$scope:scope,$rootScope:{},$http:http,$location:location,$timeout:timeout,currentUser:user,checkoutState:state};
    const entry=controllers[controller];entry.at(-1)(...entry.slice(0,-1).map(name=>deps[name]));
    return {scope,user,state,requests,location,settle:()=>new Promise(r=>setImmediate(r)),flush:()=>timers.splice(0).forEach(t=>t.active&&t.fn())};
}
test('checkout state validates required address and binds it to the reviewed cart',()=>{
    const b=setup('paymentform');
    assert.equal(b.state.validAddress(address),true);
    for(const bad of [null,{...address,street:''},{...address,flat:''},{...address,cityId:'1'},{...address,street:'<img>'}])assert.equal(b.state.validAddress(bad),false);
    b.state.address=copy(address);b.state.cartKey=b.state.key(cart);assert.equal(b.state.ready(cart),true);
    const annotated=copy(cart);annotated.items[0].$$hashKey='angular-view';assert.equal(b.state.ready(annotated),true);
    assert.equal(b.state.ready({...cart,total:99}),false);b.state.clear();assert.equal(b.state.ready(cart),false);
});
test('late city suggestions cannot repopulate a different country',async()=>{
    const b=setup('shipform');b.requests[0].resolve({data:[{code:'in',name:'India'}]});await b.settle();
    b.scope.data.country={code:'in',name:'India'};b.scope.data.cityName='del';b.scope.cityChanged();b.flush();
    const request=b.requests[1];assert.ok(request.url.endsWith('/in/del'));
    b.scope.data.country={code:'gb',name:'United Kingdom'};b.scope.countryChanged();
    request.resolve({data:[{uuid:4380870,code:'in',name:'Delhi'}]});await b.settle();
    assert.equal(b.scope.data.cities.length,0);assert.equal(b.scope.data.city,null);assert.equal(b.scope.data.shipping,null);
});
test('editing city invalidates the selected city and an in-flight shipping quote',async()=>{
    const b=setup('shipform');b.scope.data.country={code:'in',name:'India'};
    b.scope.selectCity({uuid:4380870,code:'in',name:'Delhi'});const quote=b.requests[1];
    b.scope.data.cityName='Mumbai';b.scope.cityChanged();quote.resolve({data:{cost:5,distance:100}});await b.settle();
    assert.equal(b.scope.data.city,null);assert.equal(b.scope.data.shipping,null);
});
test('street and flat are required; duplicate continue cannot duplicate the shipping request',async()=>{
    const b=setup('shipform');Object.assign(b.scope.data,{country:{code:'in',name:'India'},city:{uuid:4380870,name:'Delhi'},shipping:{cost:5,distance:100,location:'India Delhi'}});
    b.scope.confirmShipping();assert.equal(b.requests.length,1);
    Object.assign(b.scope.data,{street:'Sample Road',flat:'4B'});
    b.scope.confirmShipping();b.scope.confirmShipping();assert.equal(b.requests.length,2);
    assert.equal(b.requests[1].body.street,undefined);assert.equal(b.requests[1].body.flat,undefined);
    b.requests[1].resolve({data:copy(cart)});await b.settle();assert.equal(b.location.value,'/payment');assert.equal(b.state.ready(cart),true);
    assert.equal(b.user.cart.deliveryAddress,undefined);
});
test('payment requires checked cart and address; double click sends one EUR request',async()=>{
    const b=setup('paymentform');b.scope.pay();assert.equal(b.requests.length,1);
    b.state.address=copy(address);b.state.cartKey=b.state.key(cart);b.requests[0].resolve({data:copy(cart)});await b.settle();
    b.scope.pay();b.scope.pay();assert.equal(b.requests.length,2);const sent=b.requests[1].body;
    assert.equal(sent.total,72);assert.equal(sent.deliveryAddress.street,'Sample Road');assert.equal(b.user.cart.deliveryAddress,undefined);
    b.requests[1].resolve({data:{orderid:'TEST-ONLY',delivery:{estimate:{from:'2026-11-04',to:'2026-11-06'}}}});await b.settle();
    assert.equal(b.scope.data.cont,true);assert.equal(b.user.cart.items.length,0);assert.equal(b.state.address,null);
});
test('failed cart verification blocks payment; retry can recover',async()=>{
    const b=setup('paymentform');b.state.address=copy(address);b.state.cartKey=b.state.key(cart);
    b.requests[0].reject({status:502});await b.settle();b.scope.pay();assert.equal(b.requests.length,1);
    b.scope.loadReviewCart();b.requests[1].resolve({data:copy(cart)});await b.settle();assert.equal(b.scope.canPlaceOrder(),true);
});
test('ambiguous payment failure cannot show success or invite a duplicate submission',async()=>{
    const b=setup('paymentform');b.state.address=copy(address);b.state.cartKey=b.state.key(cart);b.requests[0].resolve({data:copy(cart)});await b.settle();
    b.scope.pay();b.requests[1].reject({status:502});await b.settle();b.scope.pay();
    assert.equal(b.requests.length,2);assert.equal(b.scope.data.cont,false);assert.equal(b.user.cart.total,72);
});
test('invalid payment response never fabricates a completed order',async()=>{
    const b=setup('paymentform');b.state.address=copy(address);b.state.cartKey=b.state.key(cart);b.requests[0].resolve({data:copy(cart)});await b.settle();
    b.scope.pay();b.requests[1].resolve({data:{}});await b.settle();assert.equal(b.scope.data.cont,false);assert.equal(b.scope.data.buttonDisabled,true);
});
