import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const mapWidth = 860;
const mapHeight = 360;

const margin = { top: 25, right: 100, bottom: 45, left: 60 };
const width = 860 - margin.left - margin.right;
const height = 360 - margin.top - margin.bottom;

const mapSvg = d3.select("#map-container")
    .append("svg")
    .attr("width", mapWidth)
    .attr("height", mapHeight);

const projection = d3.geoEquirectangular()
    .scale(135)
    .translate([mapWidth / 2, mapHeight / 2]);

const geoPath = d3.geoPath().projection(projection);

const chartSvg = d3.select("#chart-container")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

const tooltip = d3.select("body").append("div").attr("class", "tooltip");

const color = d3.scaleOrdinal()
    .domain(["historical", "ssp126", "ssp585"])
    .range(["#4682B4", "#FF8C00", "#db5d9c"]);

const regionBounds = [
    { name: "North America", lon: [-170, -50], lat: [15, 75] },
    { name: "South America", lon: [-90, -35],   lat: [-56, 12] },
    { name: "Europe",        lon: [-10, 40],   lat: [35, 71] },
    { name: "Africa",        lon: [-20, 50],   lat: [-35, 37] },
    { name: "Asia",          lon: [40, 180],   lat: [10, 75] },
    { name: "Oceania",       lon: [110, 170],  lat: [-10, 10] },
    { name: "Australia",     lon: [110, 155],  lat: [-45, -10] },
    { name: "Arctic",        lon: [-180, 180], lat: [65, 89.5] },
    { name: "Antarctica",    lon: [-180, 180], lat: [-89.5, -60] }
];

function makeRegionPolygon(region) {
    const [lonMin, lonMax] = region.lon;
    const [latMin, latMax] = region.lat;

    const topEdge = d3.range(lonMin, lonMax + 1, 5).map(lon => [lon, latMax]);
    const bottomEdge = d3.range(lonMax, lonMin - 1, -5).map(lon => [lon, latMin]);
    const coordinates = [[...topEdge, ...bottomEdge, topEdge[0]]];

    return {
        type: "Feature",
        properties: { name: region.name },
        geometry: { type: "Polygon", coordinates: coordinates }
    };
}

const regionFeatures = regionBounds.map(makeRegionPolygon);

let currentRegion = "North America";

async function init() {
    try {
        const worldData = await d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        const data = await d3.csv("regional_temperatures.csv");

        data.forEach(d => {
            d.year = +d.year;
            d.tas_anomaly = +d.tas_anomaly;
        });

        const countries = topojson.feature(worldData, worldData.objects.countries);
        mapSvg.append("g")
            .selectAll("path")
            .data(countries.features)
            .join("path")
            .attr("class", "land")
            .attr("d", geoPath);

        const regionPaths = mapSvg.append("g")
            .selectAll("path")
            .data(regionFeatures)
            .join("path")
            .attr("class", d => `region-box ${d.properties.name === currentRegion ? "active" : ""}`)
            .attr("d", geoPath)
            .on("click", (event, d) => {
                currentRegion = d.properties.name;
                regionPaths.classed("active", r => r.properties.name === currentRegion);
                d3.select("#chart-title").text(`2. Temperature Anomaly Trajectory: ${currentRegion}`);
                updateChart(data);
            })
            .on("mouseover", (event, d) => {
                tooltip.transition().duration(100).style("opacity", 0.95);
                tooltip.html(`Click to view <strong>${d.properties.name}</strong>`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 25) + "px");
            })
            .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0));

        mapSvg.append("g")
            .selectAll("text")
            .data(regionFeatures)
            .join("text")
            .attr("class", "region-label")
            .attr("transform", d => {
                if (d.properties.name === "Arctic") return `translate(${projection([-30, 70])})`;
                if (d.properties.name === "Antarctica") return `translate(${projection([0, -70])})`;
                return `translate(${geoPath.centroid(d)})`;
            })
            .text(d => d.properties.name);
        
            d3.selectAll("#scenario-filter, #time-span").on("change", () => {
    updateChart(data);
        });
        updateChart(data);

    } catch (error) {
        console.error("Error loading dataset or map:", error);
    }
}

function updateChart(data) {
    const regionData = data.filter(d => d.region === currentRegion);
    const selectedScenario = d3.select("#scenario-filter").property("value");

const [firstYear, lastYear] = d3.extent(regionData, d => d.year);
const projectionsOnly = d3.select("#time-span").property("value") === "future";
const startYear = projectionsOnly ? 2015 : firstYear;

const visibleRows = regionData.filter(d =>
    d.year >= startYear && (
        d.scenario === "historical" ||
        selectedScenario === "both" ||
        d.scenario === selectedScenario
    )
);

const nestedData = d3.group(visibleRows, d => d.scenario);

    chartSvg.selectAll(".rendered-element").remove();

    const x = d3.scaleLinear()
        .domain([startYear, lastYear])
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain([-2, 12])
        .range([height, 0]);

    chartSvg.append("g")
        .attr("class", "rendered-element")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickFormat(d3.format("d")));

    chartSvg.append("g")
        .attr("class", "rendered-element")
        .call(d3.axisLeft(y));

    chartSvg.append("text")
        .attr("class", "rendered-element axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", -45)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .text("Temperature Anomaly (°C) vs. 1850–1900");

    chartSvg.append("line")
        .attr("class", "rendered-element")
        .attr("x1", 0).attr("x2", width)
        .attr("y1", y(0)).attr("y2", y(0))
        .attr("stroke", "#888")
        .attr("stroke-dasharray", "4,4");

    const line = d3.line()
        .x(d => x(d.year))
        .y(d => y(d.tas_anomaly));

    for (let [scenario, values] of nestedData) {
        chartSvg.append("path")
            .datum(values)
            .attr("class", "rendered-element line")
            .attr("stroke", color(scenario))
            .attr("d", line);
    }

    const hoverLine = chartSvg.append("line")
        .attr("class", "rendered-element")
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#555")
        .attr("stroke-dasharray", "4,4")
        .style("opacity", 0);

    chartSvg.append("rect")
        .attr("class", "rendered-element")
        .attr("width", width)
        .attr("height", height)
        .attr("fill", "transparent")
        .style("pointer-events", "all")
        .on("mousemove", function(event) {
            const mouseX = d3.pointer(event, this)[0];
            const hoverYear = x.invert(mouseX);
            hoverLine
                .attr("x1", mouseX)
                .attr("x2", mouseX)
                .style("opacity", 1);
            
            let tooltipContent = `<strong>Year: ${Math.round(hoverYear)}</strong><br>`;

            const scenarioNames = {
                historical: "Historical",
                ssp126: "Lower Emissions (SSP1-2.6)",
                ssp585: "Higher Emissions (SSP5-8.5)"
            };

            for (let [scenario, values] of nestedData) {

                if (hoverYear < 2014 && scenario !== "historical") {
                    continue;
                }

                if (hoverYear >= 2014 && scenario === "historical") {
                    continue;
                }

                const bisect = d3.bisector(d => d.year).center;
                const index = bisect(values, hoverYear);
                const point = values[index];

                const temperatureC = point.tas - 273.15;

                tooltipContent += `
                    <div style="color: ${color(scenario)}">
                        <strong>${scenarioNames[scenario] || scenario}</strong>
                    </div>

                    <div>
                        Data year: ${point.year}<br>
                        Temperature anomaly: ${point.tas_anomaly.toFixed(2)} °C<br>
                        Mean temperature: ${temperatureC.toFixed(2)} °C
                    </div>
                    <br>
                `;
            }
            tooltip
                .html(tooltipContent)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 15) + "px")
                .style("opacity", 1);
        })
        .on("mouseout", function() {
            tooltip.style("opacity", 0);
            hoverLine.style("opacity", 0);
        });

    const legend = chartSvg.append("g")
        .attr("class", "rendered-element")
        .attr("transform", `translate(${width + 15}, 10)`);

    [...nestedData.keys()].forEach((scen, i) => {
        const row = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
        row.append("rect").attr("width", 12).attr("height", 12).attr("fill", color(scen));
        row.append("text").attr("x", 18).attr("y", 10).style("font-size", "12px").text(scen);
    });
}

init();