state = [];

function generateUrl(player) {
    const baseUrl = process.env.TEST ? "http://127.0.0.1:3000/" : "http://kursai-env.jhpzxdmpvv.eu-west-2.elasticbeanstalk.com";
    return baseUrl + player;
}

function refreshContinuously(url) {
    const xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
        // Call again after one second
        console.log(xmlHttp.responseText);
        document.getElementById("state").textContent=xmlHttp.responseText;
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
            window.setTimeout(refreshContinuously, 2000, url);
        }
    }
    xmlHttp.open("GET", url, true); // true for asynchronous
    xmlHttp.setRequestHeader("Access-Control-Allow-Origin", true);
    xmlHttp.send(null);
}

const baseUrl = process.env.TEST ? "http://127.0.0.1:3000/" : "http://kursai-env.jhpzxdmpvv.eu-west-2.elasticbeanstalk.com";
console.log(baseUrl);
refreshContinuously(baseUrl);