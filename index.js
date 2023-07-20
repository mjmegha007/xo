"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const redis = require("redis");
const memcached = require("memcached");
const util = require("util");
const KEY = `account1/balance`;
const DEFAULT_BALANCE = 100;
const MAX_EXPIRATION = 60 * 60 * 24 * 30;
const memcachedClient = new memcached(`${process.env.ENDPOINT}:${process.env.PORT}`);
exports.chargeRequestRedis = async function (input) {
    const redisClient = await getRedisClient();
    var remainingBalance = await getBalanceRedis(redisClient, KEY);
    var charges = getCharges(input);
    const isAuthorized = authorizeRequest(remainingBalance, charges);
    if (!isAuthorized) {
        return {
            remainingBalance,
            isAuthorized,
            charges: 0,
        };
    }
    remainingBalance = await chargeRedis(redisClient, KEY, charges);
    await disconnectRedis(redisClient);
    return {
        remainingBalance,
        charges,
        isAuthorized,
    };
};
exports.resetRedis = async function () {
    const redisClient = await getRedisClient();
    const ret = new Promise((resolve, reject) => {
        redisClient.set(KEY, String(DEFAULT_BALANCE), (err, res) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(DEFAULT_BALANCE);
            }
        });
    });
    await ret;
    await disconnectRedis(redisClient);
    return ret;
};
exports.resetMemcached = async function () {
    var ret = new Promise((resolve, reject) => {
        memcachedClient.add(KEY, DEFAULT_BALANCE, MAX_EXPIRATION, (error) => {
            if (!error) {
            
                console.log("Set Normally");
                resolve(DEFAULT_BALANCE);
            }
            else {
                console.log("Set via CAS");
                memcachedClient.gets(KEY, function (err, data) {
                memcachedClient.cas(KEY, DEFAULT_BALANCE, data.cas, MAX_EXPIRATION, function (err) {  });
                });
           
                resolve(DEFAULT_BALANCE);
            }
        });
    });
    await ret;
    return ret;
};
exports.chargeRequestMemcached = async function (input) {
    var remainingBalance = await getBalanceMemcached(KEY);
    console.log(remainingBalance.value);
    //console.log(remainingBalance.cas);
    const charges = input.unit;
    console.log(charges);
    const isAuthorized = authorizeRequest(remainingBalance.value, charges);
    if (!isAuthorized) {
        return {
            remainingBalance,
            isAuthorized,
            charges: 0,
        };
    }
   
    await chargeMemcached(KEY, remainingBalance.value - charges, remainingBalance.cas);
    return {
        remainingBalance,
        charges,
        isAuthorized,
    };
};
async function getRedisClient() {
    return new Promise((resolve, reject) => {
        try {
            const client = new redis.RedisClient({
                host: process.env.ENDPOINT,
                port: parseInt(process.env.PORT || "6379"),
            });
            client.on("ready", () => {
                console.log('redis client ready');
                resolve(client);
            });
        }
        catch (error) {
            reject(error);
        }
    });
}
async function disconnectRedis(client) {
    return new Promise((resolve, reject) => {
        client.quit((error, res) => {
            if (error) {
                reject(error);
            }
            else if (res == "OK") {
                console.log('redis client disconnected');
                resolve(res);
            }
            else {
                reject("unknown error closing redis connection.");
            }
        });
    });
}
function authorizeRequest(remainingBalance, charges) {
    return remainingBalance >= charges;
}
function getCharges(input) {
    console.log(input.unit);
    return input.unit;
}
async function getBalanceRedis(redisClient, key) {
    const res = await util.promisify(redisClient.get).bind(redisClient).call(redisClient, key);
    return parseInt(res || "0");
}
async function chargeRedis(redisClient, key, charges) {
    return util.promisify(redisClient.decrby).bind(redisClient).call(redisClient, key, charges);
}
async function getBalanceMemcached(key) {
    return new Promise((resolve, reject) => {
        memcachedClient.gets(key, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                console.log(data);
                resolve({value : Number(data[key]), cas: data.cas});
            }
        });
    });
}
async function chargeMemcached(key, balance, cas) {
    return new Promise((resolve, reject) => {
        console.log(cas);
        console.log(balance);
            memcachedClient.gets(KEY, function (err, data) {
                memcachedClient.cas(KEY, balance, cas, MAX_EXPIRATION, function (err) { 
                    if (err) {
                console.log("error");
                reject(err);
            }
            else {
                console.log("updated");
                return resolve();
            }  });
                });
        /*memcachedClient.cas(key, balance, cas, MAX_EXPIRATION, (err) => {
           /* if (err) {
                console.log("error");
                reject(err);
            }
            else {
                console.log("updated");
                return resolve();
            }*/
       // }); */
    });
}