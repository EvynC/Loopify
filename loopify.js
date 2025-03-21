// Instance Variables
let map, userLocationCircle, routingControl;
let currentUnit = 'mi';
let kmConstant = 1.60934;
let waypoints = [];
let targetDistance = 0;
let currentDistance = 0;
let currentElevation = 0;
let quotes = [];
let OPENROUTE_API_KEY = "";
let markers = [];
let autocompleteTimeout;
let isSearching = false;
let originalPosition;
let undoStack = [];
let redoStack = [];
let snappedLatLng = [];
let previousDistance = 0.25 * kmConstant;
let bathroomLayer, trafficLightLayer;
let showTrafficLight = true, showBathroom = true;
let loaded = false;
let satelliteLayer, osmLayer;
let isBathroomLoading = false;
let isTrafficLightLoading = false;
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000;

let isLayerToggling = false;
let isBathroomToggling = false;
let isTrafficLightToggling = false;

// Maps 
let bathroomMarkers = new Map();
let trafficLightMarkers = new Map();
let debugBoundingBoxes = [];
let startPoint = null;
let endPoint = null;

function drawBoundingBox(bbox, color) {
    const rectangle = L.rectangle(bbox, {
        color: color,
        weight: 2,
        fillOpacity: 0.1
    }).addTo(map);
    debugBoundingBoxes.push(rectangle);
}

function clearBoundingBoxes() {
    debugBoundingBoxes.forEach(rectangle => map.removeLayer(rectangle));
    debugBoundingBoxes = [];
}

function unloadFarBoundingBoxes() {
    const bounds = map.getBounds();
    const center = bounds.getCenter();
    const maxDistance = 5000; // Maximum distance in meters to keep bounding boxes

    debugBoundingBoxes = debugBoundingBoxes.filter(rectangle => {
        const bboxCenter = rectangle.getBounds().getCenter();
        const distance = map.distance(center, bboxCenter);
        if (distance > maxDistance) {
            map.removeLayer(rectangle);
            return false;
        }
        return true;
    });

    // Check for overlapping bounding boxes
    for (let i = 0; i < debugBoundingBoxes.length; i++) {
        for (let j = i + 1; j < debugBoundingBoxes.length; j++) {
            if (debugBoundingBoxes[i].getBounds().intersects(debugBoundingBoxes[j].getBounds())) {
                map.removeLayer(debugBoundingBoxes[j]);
                debugBoundingBoxes.splice(j, 1);
                j--; // Adjust index after removal
            }
        }
    }
}

function initMap() {
    map = L.map('map', {
        attributionControl: false,
        maxZoom: 18 // Set maximum zoom level
    }).setView([0, 0], 13);

    var attributionControl = L.control.attribution({
        position: 'bottomright',
        prefix: ''
    }).addTo(map);

    attributionControl.addAttribution('&copy; <a href="#" id="creditsLink">Loopify Credits</a>');

    osmLayer = L.tileLayer('http://{s}.google.com/vt?lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });
    osmLayer.addTo(map);

    satelliteLayer = L.tileLayer('http://{s}.google.com/vt?lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    });

    map.whenReady(() => {
        console.log('Map is fully initialized and ready for interactions.');
    });

    bathroomLayer = L.layerGroup().addTo(map);
    trafficLightLayer = L.layerGroup().addTo(map);

    promptForLocation();

    map.on('zoomend', updateUserLocationCircleSize);
    map.on('click', onMapClick);
    map.on('zoomend', fetchData);
    map.on('moveend', fetchData);

    // Initialize Leaflet Routing Machine without default markers
    routingControl = L.Routing.control({
        waypoints: [],
        routeWhileDragging: true,
        createMarker: function (i, waypoint, n) {
            // Create custom markers using the snapped points
            let fillColor;
            if (i === 0) {
                fillColor = 'green'; // First waypoint
            } else if (i === n - 1) {
                fillColor = 'red'; // Last waypoint
            } else {
                fillColor = 'blue'; // Intermediate waypoints
            }

            return L.marker(waypoint.latLng, {
                draggable: true,
                icon: L.divIcon({
                    className: 'custom-circle-marker',
                    html: `<div style="background-color: ${fillColor}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid black;"></div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                })
            }).on('dragend', function (e) {
                const markerIndex = markers.indexOf(e.target);
                if (markerIndex !== -1) {
                    // Save the current state to the undo stack
                    undoStack.push([...waypoints]);
                    redoStack = []; // Clear the redo stack

                    // Snap the dragged marker to the nearest road
                    const draggedLatLng = e.target.getLatLng();
                    const [snappedLat, snappedLon] = snapToNearestEdge(draggedLatLng.lat, draggedLatLng.lng);
                    const snappedPoint = L.latLng(snappedLat, snappedLon);

                    // Update the marker's position
                    e.target.setLatLng(snappedPoint);

                    // Update the waypoint's position in the array
                    waypoints[markerIndex] = snappedPoint;

                    // Update the routing machine with the new waypoints
                    routingControl.setWaypoints(waypoints);
                }
            });
        },
        lineOptions: {
            styles: [{ color: '#0044cc', weight: 5, opacity: 0.8 }] // Darker blue line
        },
        show: false // disable the itinerary summary stuff (its ugly)
    }).addTo(map);

    routingControl.on('routesfound', function (e) {
        const routes = e.routes;
        if (routes.length > 0) {
            const totalDistance = routes[0].summary.totalDistance; // Distance in meters
            updateDistanceSummary(totalDistance);
        }
    });

}


function initFilters() {

    bathroomLayer = L.layerGroup().addTo(map);
    trafficLightLayer = L.layerGroup().addTo(map);

    document.getElementById('showBathrooms').checked = true;
    document.getElementById('showTrafficLights').checked = true;

    updateObject();
}

function promptForLocation() {
    // Uses browser geolocation service
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const {
                    latitude,
                    longitude
                } = position.coords;
                originalPosition = [latitude, longitude];
                map.setView(originalPosition, 16);
                addUserLocationCircle(originalPosition);
                startingNode = {
                    lat: latitude,
                    lon: longitude
                };
                fetchData();
            },
            (error) => {
                console.error('Error getting location:', error);
                alert("Unable to get your location. Using default location.");
                originalPosition = [51.505, -0.09];
                map.setView(originalPosition, 16);
                addUserLocationCircle(originalPosition);
                startingNode = {
                    lat: 51.505,
                    lon: -0.09
                };
                fetchData();
            }
        );
    } else {
        alert("Geolocation is not supported by your browser. Using default location.");
        originalPosition = [51.505, -0.09];
        map.setView(originalPosition, 18);
        addUserLocationCircle(originalPosition);
        startingNode = {
            lat: 51.505,
            lon: -0.09
        };
        fetchData();
    }
}
function addUserLocationCircle(latlng) {
    // Controls the user location circle
    if (userLocationCircle) {
        map.removeLayer(userLocationCircle);
    }

    const zoom = map.getZoom();
    const radius = Math.max(2, zoom - 7);

    userLocationCircle = L.circleMarker(latlng, {
        color: 'white',
        fillColor: '#0031d1',
        fillOpacity: 0.8,
        radius: radius
    }).addTo(map);
}
function updateUserLocationCircleSize() {
    // Location circle's scalability
    if (userLocationCircle) {
        const zoom = map.getZoom();
        const radius = Math.max(2, zoom - 7);
        userLocationCircle.setRadius(radius);
    }
}
// MAY NOT NEED
async function requestAPI() {
    // MAY NOT NEED
    try {
        const response = await fetch('.gitignore/config.json');
        OPENROUTE_API_KEY = await response.json();
    } catch (error) {
        console.error('Error fetching quotes:', error);
    }
}

function onMapClick(e) {
    // Called when the map is clicked
    if (!isSearching && loaded) {
        // Snap the clicked point to the nearest road
        const [snappedLat, snappedLon] = snapToNearestEdge(e.latlng.lat, e.latlng.lng);
        const snappedPoint = L.latLng(snappedLat, snappedLon);

        // Add the snapped point as a waypoint
        addWaypoint(snappedPoint);

        // Update the routing machine with the new waypoints
        routingControl.setWaypoints(waypoints);
    } else {
        console.log('Please wait a second, data is still loading.');
        alert('Please wait a second, data is still loading.');
    }
}

function addWaypoint(latlng) {
    // Save the current state to the undo stack
    undoStack.push([...waypoints]);
    redoStack = []; // Clear the redo stack

    // Snap the clicked point to the nearest road
    const [snappedLat, snappedLon] = snapToNearestEdge(latlng.lat, latlng.lng);
    const snappedPoint = L.latLng(snappedLat, snappedLon);

    // Add the snapped point to the waypoints array
    waypoints.push(snappedPoint);

    // Determine the color of the marker based on its position in the route
    let fillColor;
    if (waypoints.length === 1) {
        fillColor = 'green'; // First waypoint
    } else if (waypoints.length === waypoints.length) {
        fillColor = 'red'; // Last waypoint
    } else {
        fillColor = 'blue'; // Intermediate waypoints
    }

    // Add a draggable marker styled as a circle
    const marker = L.marker(snappedPoint, {
        draggable: true,
        icon: L.divIcon({
            className: 'custom-circle-marker',
            html: `<div style="background-color: ${fillColor}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid black;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        })
    }).addTo(map);

    // Handle drag events
    marker.on('dragend', function (e) {
        console.log('Dragend event triggered for marker:', e.target);

        const markerIndex = markers.indexOf(e.target); // Find the index of the dragged marker
        console.log('Dragging ended. Marker index:', markerIndex);

        if (markerIndex !== -1) {
            // Save the current state to the undo stack
            undoStack.push([...waypoints]);
            redoStack = []; // Clear the redo stack
            console.log('Undo stack updated:', undoStack);

            // Snap the dragged marker to the nearest road
            const draggedLatLng = e.target.getLatLng();
            console.log('Dragged marker position:', draggedLatLng);

            const [snappedLat, snappedLon] = snapToNearestEdge(draggedLatLng.lat, draggedLatLng.lng);
            const snappedPoint = L.latLng(snappedLat, snappedLon);
            console.log('Snapped marker position:', snappedPoint);

            // Remove the old marker from the map and the markers array
            console.log('Removing old marker:', e.target);
            map.removeLayer(e.target); // Remove the old marker from the map
            markers.splice(markerIndex, 1); // Remove the old marker from the markers array
            console.log('Markers array after removal:', markers);

            // Add the updated marker to the map and markers array
            const updatedMarker = L.marker(snappedPoint, {
                draggable: true,
                icon: L.divIcon({
                    className: 'custom-circle-marker',
                    html: `<div style="background-color: blue; width: 16px; height: 16px; border-radius: 50%; border: 2px solid black;"></div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                })
            }).addTo(map);
            console.log('Added updated marker:', updatedMarker);

            // Add dragend event to the updated marker
            updatedMarker.on('dragend', function (e) {
                console.log('Updated marker dragged again.');
                marker.on('dragend', e);
            });

            // Update the waypoint's position in the array
            waypoints[markerIndex] = snappedPoint;
            console.log('Waypoints array after update:', waypoints);

            // Add the updated marker to the markers array
            markers.splice(markerIndex, 0, updatedMarker);
            console.log('Markers array after adding updated marker:', markers);

            // Update the routing machine with the new waypoints
            routingControl.setWaypoints(waypoints);
            console.log('Routing machine updated with new waypoints.');

            // Ensure no duplicate markers exist
            updateMarkerColors();
            console.log('Marker colors updated.');
        } else {
            console.log('Marker not found in the markers array.');
        }
    });

    // Store the marker for future reference
    markers.push(marker);

    // Update the colors of all markers to ensure the first is green, the last is red, and others are blue
    updateMarkerColors();

    // Update the routing machine with the new waypoints
    routingControl.setWaypoints(waypoints);
}

function updateMarkerColors() {
    markers.forEach((marker, index) => {
        let fillColor;
        if (index === 0) {
            fillColor = 'green'; // First waypoint
        } else if (index === markers.length - 1) {
            fillColor = 'red'; // Last waypoint
        } else {
            fillColor = 'blue'; // Intermediate waypoints
        }

        const icon = L.divIcon({
            className: 'custom-circle-marker',
            html: `<div style="background-color: ${fillColor}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid black;"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        marker.setIcon(icon);
    });
}

function snapToNearestEdge(lat, lon) {
    let nearestEdge = null;
    let minDistance = Infinity;
    let nearestPoint = [lat, lon];

    Object.values(graph.edges).forEach(edgeList => {
        edgeList.forEach(edge => {
            const fromNode = graph.nodes[edge.from];
            const toNode = graph.nodes[edge.to];

            if (fromNode && toNode) {
                const edgePoint = findNearestPointOnSegment(
                    lat, lon,
                    fromNode.lat, fromNode.lon,
                    toNode.lat, toNode.lon
                );

                const distance = haversineDistance(lat, lon, edgePoint[0], edgePoint[1]);

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestEdge = edge;
                    nearestPoint = edgePoint;
                }
            }
        });
    });
    return nearestPoint;
}

function findNearestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
        return [x1, y1];
    }
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    // Edge cases
    if (t < 0) {
        return [x1, y1];
    }
    if (t > 1) {
        return [x2, y2];
    }

    return [x1 + t * dx, y1 + t * dy];
}

function updateDistanceAndElevation() {
    // self explanatory
    currentDistance = calculateTotalDistance();
    currentElevation = calculateMockElevation(currentDistance);
    updateDistanceDisplay();
    updateElevationDisplay();
}

function updateDistanceSummary(distanceInMeters) {
    const actualDistanceElement = document.getElementById('actualDistance');
    let displayDistance;

    if (currentUnit === 'km') {
        displayDistance = distanceInMeters / 1000; // Convert meters to kilometers
        actualDistanceElement.textContent = `Distance: ${displayDistance.toFixed(2)} km`;
    } else {
        displayDistance = distanceInMeters / 1609.34; // Convert meters to miles
        actualDistanceElement.textContent = `Distance: ${displayDistance.toFixed(2)} mi`;
    }
}

function calculateTotalDistance() {
    let totalDistance = 0;
    for (let i = 1; i < waypoints.length; i++) {
        totalDistance += waypoints[i - 1].distanceTo(waypoints[i]);
    }
    return totalDistance;
}

function updateDistanceDisplay() {
    const actualDistanceElement = document.getElementById('actualDistance');
    let displayDistance;
    if (currentUnit === 'km') {
        displayDistance = currentDistance / 1000;
        actualDistanceElement.textContent = `Distance: ${displayDistance.toFixed(2)} km`;
    } else {
        displayDistance = currentDistance / 1609.34;
        actualDistanceElement.textContent = `Distance: ${displayDistance.toFixed(2)} mi`;
    }
}

function updateElevationDisplay() {
    const elevationElement = document.getElementById('elevation');
    if (currentUnit === 'km') {
        elevationElement.textContent = `Elevation: ${currentElevation.toFixed(0)} m`;
    } else {
        const elevationFt = currentElevation * 3.28084;
        elevationElement.textContent = `Elevation: ${elevationFt.toFixed(0)} ft`;
    }
}

function calculateMockElevation(distance) { // NEED TO APPLY AN API FOR THIS
    return Math.floor(distance / 100);
}

function toggleUnit(unit) {
    currentUnit = unit;
    document.querySelectorAll('.unit-option').forEach(option => {
        option.classList.toggle('active', option.dataset.unit === unit);
    });
    const slider = document.querySelector('.unit-slider');
    slider.style.transform = unit === 'km' ? 'translateX(calc(100% + 8px))' : 'translateX(0)';
    updateDistanceDisplay();
    updateElevationDisplay();
}

function toggleFullscreen() {
    const mapElement = document.getElementById('map');
    if (!document.fullscreenElement) {
        if (mapElement.requestFullscreen) {
            mapElement.requestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function relocateToOriginalPosition() {
    if (originalPosition) {
        map.setView(originalPosition, 17);
        addUserLocationCircle(originalPosition);
    }
}

async function fetchQuotes() {
    try {
        const response = await fetch('./quotes/RunningQuote.json');
        quotes = await response.json();
        displayRandomQuote();
    } catch (error) {
        console.error('Error fetching quotes:', error);
    }
}

function displayRandomQuote() {
    if (quotes.length === 0) return;

    const randomIndex = Math.floor(Math.random() * quotes.length);
    const randomQuote = quotes[randomIndex];

    document.getElementById('quote').textContent = `"${randomQuote.quote}"`;
    document.getElementById('author').textContent = `- ${randomQuote.author}`;
}

function getQuote(index) {
    if (quotes.length === 0) return;

    const quote = quotes[index];

    document.getElementById('quote').textContent = `"${quote.quote}"`;
    document.getElementById('author').textContent = `- ${quote.author}`;
}

function clearRoute() {
    // Clear waypoints and markers
    waypoints = [];
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    // Clear the routing machine
    routingControl.setWaypoints([]);

    // Clear the map information stuff
    if (currentUnit === 'km') {
        document.getElementById('actualDistance').textContent = 'Distance: 0.00 km';
    } else {
        document.getElementById('actualDistance').textContent = 'Distance: 0.00 mi';
    }
}

function searchLocation() {
    const query = document.getElementById('searchInput').value;
    if (query.length < 3) return;

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            const autocompleteResults = document.getElementById('autocompleteResults');
            autocompleteResults.innerHTML = '';

            if (data.length === 0) {
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.textContent = 'No location found';
                autocompleteResults.appendChild(noResults);
            } else {
                data.slice(0, 5).forEach(result => {
                    const item = document.createElement('div');
                    item.className = 'autocomplete-item';
                    item.textContent = result.display_name;
                    item.addEventListener('click', () => selectLocation(result));
                    autocompleteResults.appendChild(item);
                });
            }
            autocompleteResults.style.display = 'block';
        })
        .catch(error => {
            console.error('Error:', error);
            const autocompleteResults = document.getElementById('autocompleteResults');
            autocompleteResults.innerHTML = '';
            const errorMessage = document.createElement('div');
            errorMessage.className = 'no-results';
            errorMessage.textContent = 'Error searching for location';
            autocompleteResults.appendChild(errorMessage);
            autocompleteResults.style.display = 'block';
        });
}

function selectLocation(location) {
    const latlng = L.latLng(parseFloat(location.lat), parseFloat(location.lon));
    map.setView(latlng, 18);
    addWaypoint(latlng);
    document.getElementById('autocompleteResults').style.display = 'none';
    document.getElementById('searchInput').value = location.display_name;
    isSearching = false;
}

function undo() {
    if (undoStack.length > 0) {
        redoStack.push([...waypoints]);
        waypoints = undoStack.pop();
        updateRouteAndMarkers();
        routingControl.setWaypoints(waypoints);
    }
}

function redo() {
    if (redoStack.length > 0) {
        undoStack.push([...waypoints]);
        waypoints = redoStack.pop();
        updateRouteAndMarkers();
        routingControl.setWaypoints(waypoints);
    }
}

function updateRouteAndMarkers() {
    // Remove ALL existing markers from the map
    for (let i = markers.length - 1; i >= 0; i--) {
        if (markers[i]) {
            map.removeLayer(markers[i]);
        }
    }

    // Clear the markers array
    markers = [];

    // Add new markers for each waypoint
    waypoints.forEach((latlng, index) => {
        // Create marker code...
        // Make sure to use the onDragEnd function defined above
        marker.on('dragend', onDragEnd);
        markers.push(marker);
    });

    // Update the routing
    routingControl.setWaypoints(waypoints);
}

const EARTH_RADIUS = 6371; // km

function haversineDistance(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS * c;
}

function getBoundingBox(lat, lon, distance) {
    if (currentUnit === 'mi') {
        distance *= kmConstant; // Convert miles to kilometers
    }

    const EARTH_RADIUS = 6371; // Earth's radius in kilometers
    const latChange = (distance / EARTH_RADIUS) * (180 / Math.PI);
    const lonChange = (distance / (EARTH_RADIUS * Math.cos(lat * Math.PI / 180))) * (180 / Math.PI);

    const boundingBox = [
        [lat - latChange, lon - lonChange], // Bottom-left (south-west)
        [lat + latChange, lon + lonChange] // Top-right (north-east)
    ];

    const topLeft = [lat + latChange, lon - lonChange];
    const topRight = [lat + latChange, lon + lonChange];

    // Call the haversineDistance function to calculate distance between top-left and top-right
    const distanceTopLeftToTopRight = haversineDistance(topLeft[0], topLeft[1], topRight[0], topRight[1]);

    console.log("Distance between Top-Left and Top-Right: ", distanceTopLeftToTopRight.toFixed(2), "km");

    return boundingBox;
}


// This is the filters dropdown code 
function toggleDropdown() {
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.classList.toggle('show');
}

async function loadBathrooms() {
    isBathroomLoading = true;
    const bounds = map.getBounds();
    const cacheKey = `bathrooms_${bounds.getSouth()}_${bounds.getWest()}_${bounds.getNorth()}_${bounds.getEast()}`;
    const cachedData = localStorage.getItem(cacheKey);

    const startTime = performance.now();

    if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        if (Date.now() - timestamp < CACHE_EXPIRATION) {
            console.log("Using cached bathroom data");
            bathrooms = data;
        }
    } else {
        const url = `https://overpass-api.de/api/interpreter?data=[out:json];node["amenity"="toilets"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`;
        console.log('Fetching bathrooms:', url);

        bathrooms = await fetchAndFilterObjects(url, './assets/Bathroom.png');

        // Cache the fetched data
        localStorage.setItem(cacheKey, JSON.stringify({ data: bathrooms, timestamp: Date.now() }));
    }

    const endTime = performance.now();
    console.log(`Bathrooms loaded in ${(endTime - startTime).toFixed(2)} ms`);

    updateMarkers(bathrooms, bathroomMarkers, bathroomLayer, 'Bathroom');
    isBathroomLoading = false;
}

async function loadTrafficLights() {
    isTrafficLightLoading = true;
    const bounds = map.getBounds();
    const cacheKey = `lights_${bounds.getSouth()}_${bounds.getWest()}_${bounds.getNorth()}_${bounds.getEast()}`;
    const cachedData = localStorage.getItem(cacheKey);

    const startTime = performance.now();

    if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        if (Date.now() - timestamp < CACHE_EXPIRATION) {
            console.log("Using cached traffic light data");
            lights = data;
        }
    } else {
        const url = `https://overpass-api.de/api/interpreter?data=[out:json];node["highway"="traffic_signals"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`;
        console.log('Fetching traffic lights:', url);

        lights = await fetchAndFilterObjects(url, './assets/TrafficLight.png');

        // Cache the fetched data
        localStorage.setItem(cacheKey, JSON.stringify({ data: lights, timestamp: Date.now() }));
    }

    const endTime = performance.now();
    console.log(`Traffic lights loaded in ${(endTime - startTime).toFixed(2)} ms`);

    updateMarkers(lights, trafficLightMarkers, trafficLightLayer, 'TrafficLight');
    isTrafficLightLoading = false;
}

async function fetchAndFilterObjects(url, iconPath) {
    const response = await fetch(url);
    const data = await response.json();
    return filterObjects(data.elements, iconPath);
}

function filterObjects(objects, iconPath) {
    const thresholdDistance = 100; // meters
    const filteredObjects = [];
    objects.forEach(object => {
        if (!filteredObjects.some(filteredObject =>
            haversineDistance(filteredObject.lat, filteredObject.lon, object.lat, object.lon) *
            1000 < thresholdDistance
        )) {
            filteredObjects.push(object);
        }
    });
    return filteredObjects;
}

async function fetchRoadData(bbox) {
    const query = `
[out:json];
(
way["highway"](${bbox[0][0]},${bbox[0][1]},${bbox[1][0]},${bbox[1][1]});
node(w);
);
out body;
>;
out skel qt;
`;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    const graph = {
        nodes: {},
        edges: {}
    };

    // Process all nodes
    data.elements.forEach(element => {
        if (element.type === 'node') {
            graph.nodes[element.id] = {
                id: element.id,
                lat: element.lat,
                lon: element.lon
            };
        }
    });

    // Process all ways
    data.elements.forEach(element => {
        if (element.type === 'way' && element.tags && element.tags.highway) {
            for (let i = 1; i < element.nodes.length; i++) {
                const fromId = element.nodes[i - 1];
                const toId = element.nodes[i];
                if (graph.nodes[fromId] && graph.nodes[toId]) {
                    const fromNode = graph.nodes[fromId];
                    const toNode = graph.nodes[toId];
                    const distance = haversineDistance(fromNode.lat, fromNode.lon, toNode
                        .lat,
                        toNode.lon);
                    if (!graph.edges[fromId]) graph.edges[fromId] = [];
                    if (!graph.edges[toId]) graph.edges[toId] = [];
                    graph.edges[fromId].push({
                        from: fromId,
                        to: toId,
                        distance,
                        name: element.tags.name || '',
                        highway: element.tags.highway
                    });
                    graph.edges[toId].push({
                        from: toId,
                        to: fromId,
                        distance,
                        name: element.tags.name || '',
                        highway: element.tags.highway
                    });
                }
            }
        }
    });
    return graph;
}

async function fetchRoadDataWithRateLimit(bbox, retries = 3) {
    const query = `
[out:json];
(
way["highway"](${bbox[0][0]},${bbox[0][1]},${bbox[1][0]},${bbox[1][1]});
node(w);
);
out body;
>;
out skel qt;
`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: query
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();

            const graph = {
                nodes: {},
                edges: {}
            };

            // Process all nodes
            data.elements.forEach(element => {
                if (element.type === 'node') {
                    graph.nodes[element.id] = {
                        id: element.id,
                        lat: element.lat,
                        lon: element.lon
                    };
                }
            });

            // Process all ways
            data.elements.forEach(element => {
                if (element.type === 'way' && element.tags && element.tags.highway) {
                    for (let i = 1; i < element.nodes.length; i++) {
                        const fromId = element.nodes[i - 1];
                        const toId = element.nodes[i];
                        if (graph.nodes[fromId] && graph.nodes[toId]) {
                            const fromNode = graph.nodes[fromId];
                            const toNode = graph.nodes[toId];
                            const distance = haversineDistance(fromNode.lat, fromNode.lon, toNode.lat, toNode.lon);
                            if (!graph.edges[fromId]) graph.edges[fromId] = [];
                            if (!graph.edges[toId]) graph.edges[toId] = [];
                            graph.edges[fromId].push({
                                from: fromId,
                                to: toId,
                                distance,
                                name: element.tags.name || '',
                                highway: element.tags.highway
                            });
                            graph.edges[toId].push({
                                from: toId,
                                to: fromId,
                                distance,
                                name: element.tags.name || '',
                                highway: element.tags.highway
                            });
                        }
                    }
                }
            });

            return graph;
        } catch (error) {
            console.error(`Attempt ${attempt} failed:`, error.message || error);

            if (attempt === retries) {
                throw new Error('Failed to fetch road data after multiple attempts.');
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
}

function visualizeData() {
    if (!graph) {
        console.error('No graph data available. Please fetch data first.');
        return;
    }
    if (boundingBoxLayer) map.removeLayer(boundingBoxLayer);
    if (nodesLayer) map.removeLayer(nodesLayer);
    if (edgesLayer) map.removeLayer(edgesLayer);
    const distance = parseFloat(document.getElementById('distanceInput').value);
    let center;
    if (startingNode) {
        center = L.latLng(startingNode.lat, startingNode.lon);
    } else if (userLocationCircle) {
        center = userLocationCircle.getLatLng();
    } else {
        center = map.getCenter();
    }
    const bbox = getBoundingBox(center.lat, center.lng, distance);
    boundingBoxLayer = L.rectangle(bbox, {
        color: 'blue',
        weight: 2,
        fillOpacity: 0.1
    }).addTo(map);

    nodesLayer = L.layerGroup().addTo(map);

    Object.values(graph.nodes).forEach(node => {
        L.circleMarker([node.lat, node.lon], {
            radius: 3,
            color: 'green',
            fillOpacity: 1
        }).addTo(nodesLayer);
    });

    edgesLayer = L.layerGroup().addTo(map);
    Object.values(graph.edges).forEach(edgeList => {
        edgeList.forEach(edge => {
            const fromNode = graph.nodes[edge.from];
            const toNode = graph.nodes[edge.to];
            L.polyline([
                [fromNode.lat, fromNode.lon],
                [toNode.lat, toNode.lon]
            ], {
                color: 'purple',
                weight: 2,
                opacity: 0.7
            }).addTo(edgesLayer);
        });
    });

    console.log(`Visualized ${Object.keys(graph.nodes).length} nodes and
${Object.values(graph.edges).reduce((sum, edges) => sum + edges.length, 0)} edges`);
}

let routeLayer, boundingBoxLayer, userMarker, nodesLayer, edgesLayer;
let graph = null;
let startingNode = null;

async function fetchData() {
    const bounds = map.getBounds();
    const bbox = [
        [bounds.getSouth(), bounds.getWest()],
        [bounds.getNorth(), bounds.getEast()]
    ];

    try {
        const newGraph = await fetchRoadDataWithRateLimit(bbox);
        graph = mergeGraphs(graph, newGraph);

        if (Object.keys(graph.nodes).length === 0) {
            throw new Error('No road data found in the selected area. Try moving the map or increasing the distance.');
        }

        console.log(`Fetched ${Object.keys(graph.nodes).length} nodes and ${Object.keys(graph.edges).length} edges`);
        loaded = true;

        // Unload far bounding boxes
        unloadFarBoundingBoxes();
    } catch (error) {
        console.error('Error fetching road data:', error);
        alert('Error fetching road data. Please try again.');
    }
}

function findNearestNode(point, graph) {
    let nearestNode = null;
    let minDistance = Infinity;

    for (const nodeId in graph.nodes) {
        const node = graph.nodes[nodeId];
        const distance = haversineDistance(point.lat, point.lng, node.lat, node.lon);
        if (distance < minDistance) {
            minDistance = distance;
            nearestNode = nodeId;
        }
    }

    return nearestNode;
}

function findShortestPath(startNodeId, endNodeId) {
    const distances = {};
    const previous = {};
    const unvisited = new Set(Object.keys(graph.nodes));

    Object.keys(graph.nodes).forEach(nodeId => { // set all to Inf distance and no previous 
        distances[nodeId] = Infinity;
        previous[nodeId] = null;
    });

    distances[startNodeId] = 0; // Node A or start with 0 distance like in video

    console.log(unvisited.size)

    while (unvisited.size > 0) { // exit statement

        // Getting closest Node
        let currentNodeId = null;
        let minDistance = Infinity;

        for (const nodeId of unvisited) {
            if (distances[nodeId] < minDistance) {
                minDistance = distances[nodeId];
                currentNodeId = nodeId;
            }
        }

        if (currentNodeId === null) {
            console.log("rip") // WHY IS IT GOING HERE AND LEAVING
            return null;
        } else if (minDistance === Infinity) {
            console.log("rip2") // WHY IS IT GOING HERE AND LEAVING
            return null;
        }

        // If it found the end
        // It goes backwards and reconstructs the path with pointers to previous nodes
        if (currentNodeId === endNodeId) {
            const path = [];
            let currentNode = endNodeId;
            while (currentNode) {
                path.unshift(currentNode);
                currentNode = previous[currentNode];
            }
            return path;
        }

        unvisited.delete(currentNodeId);

        // For each edge/node connected to the current node

        graph.edges[currentNodeId].forEach(edge => {
            const neighborNodeId = edge.to;
            if (unvisited.has(neighborNodeId)) { // if it hasn't been visited
                const alt = distances[currentNodeId] + edge.distance; // calculate the distance
                if (alt < distances[neighborNodeId]) {  // if it's less than the current distance
                    distances[neighborNodeId] = alt; // set the new distance
                    previous[neighborNodeId] = currentNodeId; // set the previous node
                }
            }
        });
    }

    return null; // No path found
}

function drawPath(path) {
    const latlngs = path.map(nodeId => {
        const node = graph.nodes[nodeId];
        return [node.lat, node.lon];
    });

    L.polyline(latlngs, {
        color: 'red',
        weight: 4,
        opacity: 0.7
    }).addTo(map);
}

async function prefetchSurroundingAreas(center, distance) {
    const offsets = [
        [distance, 0],
        [-distance, 0],
        [0, distance],
        [0, -distance],
        [distance, distance],
        [-distance, -distance],
        [distance, -distance],
        [-distance, distance]
    ];

    for (const offset of offsets) {
        const newCenter = L.latLng(center.lat + offset[0], center.lng + offset[1]);
        const bbox = getBoundingBox(newCenter.lat, newCenter.lng, distance);

        try {
            const newGraph = await fetchRoadData(bbox);
            graph = mergeGraphs(graph, newGraph);
            console.log(`Prefetched data for bbox: ${bbox}`);
        } catch (error) {
            console.error(`Error prefetching data for bbox: ${bbox}`, error);
        }
    }
}

function toggleSatelliteView() {
    const satelliteCheckbox = document.getElementById('satelliteView');
    const isChecked = satelliteCheckbox.checked;

    if (!osmLayer || !satelliteLayer) {
        console.error('Layers are not initialized yet.');
        return;
    }

    if (isLayerToggling) return; // Prevent toggle during operation
    isLayerToggling = true;

    // Display loading indicator
    satelliteCheckbox.disabled = true;

    if (isChecked) {
        if (map.hasLayer(osmLayer)) {
            map.removeLayer(osmLayer);
        }
        map.addLayer(satelliteLayer);
    } else {
        if (map.hasLayer(satelliteLayer)) {
            map.removeLayer(satelliteLayer);
        }
        map.addLayer(osmLayer);
    }

    setTimeout(() => {
        isLayerToggling = false;
        satelliteCheckbox.disabled = false; // Re-enable checkbox
    }, 300); // Allow time for layers to settle
}

function toggleLayer(layer, isLoading, loadFunction, markers, layerGroup) {
    if (isLoading) return;

    const isChecked = document.getElementById(layer).checked;

    if (isChecked) {
        if (markers.size === 0) {
            loadFunction();
        }
        if (!map.hasLayer(layerGroup)) {
            map.addLayer(layerGroup);
        }
    } else {
        if (map.hasLayer(layerGroup)) {
            map.removeLayer(layerGroup);
        }
        layerGroup.clearLayers();
        markers.clear();
    }
}

function toggleTrafficLights() {
    toggleLayer('showTrafficLights', isTrafficLightLoading, loadTrafficLights, trafficLightMarkers, trafficLightLayer);
}

function toggleBathrooms() {
    toggleLayer('showBathrooms', isBathroomLoading, loadBathrooms, bathroomMarkers, bathroomLayer);
}

async function updateObject(object) {
    const bounds = map.getBounds();
    const zoom = map.getZoom();

    // If it doesn't exist don't do anything
    if (!map || !bathroomLayer || !trafficLightLayer) return;

    // If the zoom is too big just remove everything
    console.log("Zoom:" + zoom)
    console.log("UPDATED OBJECTS")


    // BATHROOMS
    if (object === "Bathroom" || object === "All") {
        if (document.getElementById('showBathrooms').checked) {
            if (!isBathroomLoading && bathroomMarkers.size === 0) {
                await loadBathrooms();
            }
        } else {
            bathroomLayer.clearLayers();
            bathroomMarkers.clear();
        }
    }

    // TRAFFIC LIGHTS
    if (object === "TrafficLight" || object === "All") {
        if (document.getElementById('showTrafficLights').checked) {
            const lights = await fetchAndFilterObjects(
                `https://overpass-api.de/api/interpreter?data=[out:json];node["highway"="traffic_signals"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});out;`,
                './assets/TrafficLight.png'
            );
            updateMarkers(lights, trafficLightMarkers, trafficLightLayer, 'TrafficLight');
        } else {
            trafficLightLayer.clearLayers();
            trafficLightMarkers.clear();
        }
    }
}

function updateMarkers(objects, markerMap, layer, type) {
    const bounds = map.getBounds();
    const iconUrl = type === 'Bathroom' ? './assets/Bathroom.png' : './assets/TrafficLight.png';

    // Remove markers that are no longer in view
    markerMap.forEach((marker, id) => {
        if (!bounds.contains(marker.getLatLng())) {
            layer.removeLayer(marker);
            markerMap.delete(id);
        }
    });

    // Add new markers
    objects.forEach(obj => {
        const id = `${obj.lat},${obj.lon}`;
        if (!markerMap.has(id)) {
            const marker = L.marker([obj.lat, obj.lon], {
                icon: L.icon({
                    iconUrl: iconUrl,
                    iconSize: [25, 25],
                    iconAnchor: [12, 41]
                })
            });
            marker.addTo(layer);
            markerMap.set(id, marker);
        }
    });
}

function onMapMove() {
    const bounds = map.getBounds();
    const center = bounds.getCenter();
    const distance = parseFloat(document.getElementById('distanceInput').value);

    const bbox = getBoundingBox(center.lat, center.lng, distance);

    fetchRoadData(bbox).then((newGraph) => {
        graph = mergeGraphs(graph, newGraph);
        console.log('Data loaded for new area');
        prefetchSurroundingAreas(center, distance);

        // Unload far bounding boxes
        unloadFarBoundingBoxes();
    }).catch((error) => {
        console.error('Error fetching data for new area', error);
    });
}

function mergeGraphs(existingGraph, newGraph) {
    if (!existingGraph) {
        return newGraph;
    }

    const mergedGraph = {
        nodes: { ...existingGraph.nodes },
        edges: { ...existingGraph.edges }
    };

    Object.keys(newGraph.nodes).forEach(nodeId => {
        if (!mergedGraph.nodes[nodeId]) {
            mergedGraph.nodes[nodeId] = newGraph.nodes[nodeId];
        }
    });

    Object.keys(newGraph.edges).forEach(nodeId => {
        if (!mergedGraph.edges[nodeId]) {
            mergedGraph.edges[nodeId] = newGraph.edges[nodeId];
        } else {
            newGraph.edges[nodeId].forEach(edge => {
                if (!mergedGraph.edges[nodeId].some(e => e.to === edge.to)) {
                    mergedGraph.edges[nodeId].push(edge);
                }
            });
        }
    });

    return mergedGraph;
}

function removeWaypoint() {
    if (waypoints.length > 0) {
        // Save the current state to the undo stack
        undoStack.push([...waypoints]);
        redoStack = []; // Clear the redo stack

        // Remove the last waypoint
        waypoints.pop();

        // Update the route and markers
        updateRouteAndMarkers();

        // Recalculate the route in the routing machine
        routingControl.setWaypoints(waypoints);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    fetchQuotes();
    initFilters();
    // requestAPI(); Not in use

    // Synchronize the state of the satellite view checkbox with the current layer
    const satelliteCheckbox = document.getElementById('satelliteView');
    if (map.hasLayer(satelliteLayer)) {
        satelliteCheckbox.checked = true;
    } else {
        satelliteCheckbox.checked = false;
    }

    // Synchronize the state of the bathroom checkbox with the current layer
    const bathroomCheckbox = document.getElementById('showBathrooms');
    if (map.hasLayer(bathroomLayer)) {
        bathroomCheckbox.checked = true;
    } else {
        bathroomCheckbox.checked = false;
    }

    // Synchronize the state of the traffic light checkbox with the current layer
    const trafficLightCheckbox = document.getElementById('showTrafficLights');
    if (map.hasLayer(trafficLightLayer)) {
        trafficLightCheckbox.checked = true;
    } else {
        trafficLightCheckbox.checked = false;
    }

    document.getElementById('generateButton').addEventListener('click', (event) => {
        event.stopPropagation();
        let distance = parseFloat(document.getElementById('distanceInput').value);
        if (currentUnit === 'mi') {
            distance *= kmConstant;
        }

        if (distance <= 0) {
            alert('Please enter a positive distance.');
            return;
        } else if (distance > 100) {
            alert('Please enter a distance less than 100 km.');
            return;
        }

        visualizeData();
    });

    document.getElementById('unitToggle').addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.classList.contains('unit-option'))
            toggleUnit(e.target.dataset.unit);
    });

    document.getElementById('clearButton').addEventListener('click', (event) => {
        event.stopPropagation();
        clearRoute();
    });

    document.getElementById('quoteContainer').addEventListener('click', (event) => {
        event.stopPropagation();
        if (quotes.length > 0) {
            displayRandomQuote();
        } else {
            console.error('Quotes array is empty.');
        }
    });

    document.getElementById('fullscreenButton').addEventListener('click', (event) => {
        event.stopPropagation();
        toggleFullscreen();
    });

    document.getElementById('fullscreenButton').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });

    document.getElementById('relocateButton').addEventListener('click', (event) => {
        event.stopPropagation();
        relocateToOriginalPosition();
    });

    document.getElementById('relocateButton').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });

    document.getElementById('searchInput').addEventListener('input', (event) => {
        event.stopPropagation();
        clearTimeout(autocompleteTimeout);
        autocompleteTimeout = setTimeout(searchLocation, 300);
    });

    document.getElementById('searchInput').addEventListener('keydown', function (event) {
        event.stopPropagation();
        if (event.key === "Enter") {
            searchLocation(); // Call the searchLocation function
            console.log("Searching location..."); // Fixing console log
        }
    });

    document.getElementById('searchButton').addEventListener('click', (event) => {
        event.stopPropagation();
        searchLocation();
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('#searchContainer')) {
            document.getElementById('autocompleteResults').style.display = 'none';
        }
        event.stopPropagation(); // NOT WORKING FOR SOEM REASON 
    });

    document.getElementById('undoButton').addEventListener('click', (event) => {
        event.stopPropagation();
        undo();
    });

    document.getElementById('undoButton').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });

    document.getElementById('redoButton').addEventListener('click', (event) => {
        event.stopPropagation();
        redo();
    });

    document.getElementById('redoButton').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undo();
        } else if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            redo();
        } else if (e.ctrlKey && e.key === 'x') {
            e.preventDefault();
            removeWaypoint();
        }
    });

    const termsLink = document.getElementById('termsLink');
    const termsDialog = document.getElementById('termsDialog');
    const closeButton = document.querySelector('.close');

    termsLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        termsDialog.style.display = 'flex';
    });

    closeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        termsDialog.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === termsDialog) {
            termsDialog.style.display = 'none';
        }
    });

    const creditsLink = document.getElementById('creditsLink');
    const creditsDialog = document.getElementById('creditsDialog');
    const closeButton2 = document.querySelector('.close2');

    creditsLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        creditsDialog.style.display = 'flex';
    });

    closeButton2.addEventListener('click', (event) => {
        event.stopPropagation();
        creditsDialog.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === creditsDialog) {
            creditsDialog.style.display = 'none';
        }
    });

    document.getElementById('uploadButton').addEventListener('click', (event) => {
        event.stopPropagation();
        alert('Upload functionality is not implemented yet.');
    });

    document.getElementById('downloadButton').addEventListener('click', (event) => {
        event.stopPropagation();
        alert('Download functionality is not implemented yet.');
    });

    document.getElementById('shareButton').addEventListener('click', (event) => {
        event.stopPropagation();
        alert('Share functionality is not implemented yet.');
    });

    document.getElementById('distanceInput').addEventListener("change", (event) => {
        event.stopPropagation();
        let distance = parseFloat(document.getElementById('distanceInput').value);
        if (currentUnit === "mi") {
            distance *= kmConstant;
        }

        if (previousDistance !== distance) {
            console.log("Distance Changed");
            fetchData();
            previousDistance = distance;
        }
    });

    // Shows the filter tab when clicked
    document.addEventListener('click', function (event) {
        const selectWrapper = document.querySelector('.select-wrapper');
        const optionsContainer = document.getElementById('optionsContainer');

        if (!selectWrapper.contains(event.target)) {
            optionsContainer.classList.remove('show');
        }
        event.stopPropagation();
    });

    // Changes the check box
    const options = document.querySelectorAll('.option');
    options.forEach(option => {
        option.addEventListener('click', function (event) {
            event.stopPropagation();
            const checkbox = this.querySelector('input[type="checkbox"]');
            if (event.target !== checkbox && event.target !== checkbox.nextElementSibling) {
                if (isLayerToggling || isTrafficLightToggling || isBathroomToggling)
                    return;
                checkbox.checked = !checkbox.checked;
            }
        });
    });

    // Traffic Light Toggle 
    document.getElementById('showTrafficLights').addEventListener('click', (event) => {
        event.stopPropagation();
        toggleTrafficLights();
    });

    document.getElementById('showTrafficLights2').addEventListener('click', (event) => {
        event.stopPropagation();
        toggleTrafficLights();
    });

    document.getElementById('showBathrooms').addEventListener('click', (event) => {
        event.stopPropagation();
        toggleBathrooms();
        updateObject('Bathroom'); // Update immediately
    });

    document.getElementById('showBathrooms2').addEventListener('dblclick', (event) => {
        event.stopPropagation();
    });

    document.getElementById('satelliteView').addEventListener('click', (event) => {
        event.stopPropagation();
        toggleSatelliteView();
    });

    document.getElementById('satelliteView2').addEventListener('dblclick', (event) => {
        event.stopPropagation(); // Prevent double-click propagation
        console.log('Button double-clicked!');
    });

    // Prevent click through on search input and autocomplete results
    document.getElementById('searchInput').addEventListener('click', (event) => {
        event.stopPropagation();
    });

    document.getElementById('autocompleteResults').addEventListener('click', (event) => {
        event.stopPropagation();
    });

    // Prevent click through on filter dropdown
    document.querySelector('.select-wrapper').addEventListener('click', (event) => {
        event.stopPropagation();
    });
});