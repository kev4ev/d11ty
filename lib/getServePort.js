const net = require('net');

const START = 44154;

function nextAvailablePort(port=START){
    return new Promise((res, rej) => {
        let server = net.createServer();
        server.on('listening', ()=>{
            server.close();
        });
        server.on('close', ()=> {
            res(port);
        });
        server.on('error', async (err)=>{
            return await nextAvailablePort(port + 1);
        });
        server.listen(port);
    })
}

/**
 * returns the next available port number, beginning at 44154
 * @returns {Promise<number>}
 */
async function getServePort(){
    return await nextAvailablePort();
}

module.exports = getServePort;