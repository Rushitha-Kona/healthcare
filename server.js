const http = require('http');
const fs = require('fs');
const _ = require('lodash');

const server = http.createServer((req, res) => {
    const num = _.random(0, 20);
    console.log(`Random Number: ${num}`);

    res.setHeader('Content-Type', 'text/html');
    let path = './frontend/';

    switch (req.url) {
        case '/':
            path += 'index.ejs';
            break;
        case '/register':
            path += 'register.ejs';
            break;
        case '/login':
            path += 'login.ejs';
            break;
        case '/bmi':
            path += 'bmi.ejs';
            break;
        case '/diet-plan':
            path += 'diet-plan.ejs';
            break;
        case '/profile':
            path += 'profile.ejs';
            break;
        case '/chatbot':
                path += 'chatbot.ejs';
                break;

        default:
            path += '404.html';
            break;
    }

    fs.readFile(path, (err, data) => {
        if (err) {
            console.log(err);
            res.writeHead(500);
            res.end('Internal Server Error');
        } else {
            res.write(data);
            res.end();
        }
    });
});

server.listen(4000, 'localhost', () => {
    console.log('Server is running on http://localhost:4000');
});
