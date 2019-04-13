state = [];

function generateUrl(player) {
    const baseUrl = process.env.TEST ? "http://127.0.0.1:3000/" : "SOME_URL/";
    return baseUrl + player;
}

function refreshContinuously(url) {
    const xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
        // Call again after one second
        console.log(xmlHttp.responseText);
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200) {
            window.setTimeout(refreshContinuously, 1000, url);
        }
    }
    xmlHttp.open("GET", url, true); // true for asynchronous
    xmlHttp.setRequestHeader("Access-Control-Allow-Origin", true);
    xmlHttp.send(null);
}

let url = "http://127.0.0.1:3000/games"; //generateUrl("sute");
console.log(url);
refreshContinuously(url);