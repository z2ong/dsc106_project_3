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
    .scale((mapHeight - 12) / Math.PI)
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

const scenarioNames = {
    historical: "Historical",
    ssp126: "SSP1-2.6",
    ssp585: "SSP5-8.5"
};
const formatAnomaly = d3.format("+.2f");
let selectedYear = 2100;

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

        // Draw each study box directly in the rectangular projection.
        // Put the full-width polar bands behind the smaller study boxes.
        const mapOrder = [...regionBounds].sort((a, b) =>
            d3.descending(a.lon[1] - a.lon[0], b.lon[1] - b.lon[0])
        );
        const regionPaths = mapSvg.append("g")
            .selectAll("rect")
            .data(mapOrder)
            .join("rect")
            .attr("class", "region-box")
            .classed("active", d => d.name === currentRegion)
            .attr("aria-label", d => d.name)
            .attr("x", d => projection([d.lon[0], d.lat[1]])[0])
            .attr("y", d => projection([d.lon[0], d.lat[1]])[1])
            .attr("width", d => (d.lon[1] - d.lon[0]) * Math.PI / 180 * projection.scale())
            .attr("height", d => (d.lat[1] - d.lat[0]) * Math.PI / 180 * projection.scale())
            .attr("role", "button")
            .attr("tabindex", 0)
            .attr("aria-pressed", d => String(d.name === currentRegion))
            .on("click keydown", (event, d) => {
                if (event.type === "keydown") {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                }
                currentRegion = d.name;
                regionPaths.classed("active", r => r.name === currentRegion)
                    .attr("aria-pressed", r => String(r.name === currentRegion));
                d3.select("#chart-title").text(`2. Temperature Anomaly Trajectory: ${currentRegion}`);
                updateChart(data);
            })
            .on("mouseover", (event, d) => {
                tooltip.transition().duration(100).style("opacity", 0.95);
                tooltip.text(`Click to view ${d.name}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 25) + "px");
            })
            .on("mouseout", () => tooltip.transition().duration(200).style("opacity", 0));

        mapSvg.append("g")
            .selectAll("text")
            .data(regionBounds)
            .join("text")
            .attr("class", "region-label")
            .attr("transform", d => `translate(${projection([
                d3.mean(d.lon), d.name === "Arctic" ? 81 : d3.mean(d.lat)
            ])})`)
            .text(d => d.name);

        updateChart(data);

    } catch (error) {
        console.error("Error loading dataset or map:", error);
    }
}

function updateChart(data) {
    const regionData = data.filter(d => d.region === currentRegion);
    const nestedData = d3.group(regionData, d => d.scenario);

    chartSvg.selectAll(".rendered-element").remove();

    const x = d3.scaleLinear()
        .domain(d3.extent(regionData, d => d.year))
        .range([0, width]);

    const y = d3.scaleLinear()
        .domain(d3.extent(data, d => d.tas_anomaly))
        .range([height, 0])
        .nice();

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

    const legend = chartSvg.append("g")
        .attr("class", "rendered-element")
        .attr("transform", `translate(${width + 15}, 10)`);

    ["historical", "ssp126", "ssp585"].forEach((scen, i) => {
        const row = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
        row.append("rect").attr("width", 12).attr("height", 12).attr("fill", color(scen));
        row.append("text").attr("x", 18).attr("y", 10).style("font-size", "12px").text(scenarioNames[scen]);
    });

    const valuesByYear = d3.group(regionData, d => d.year);
    const [firstYear, lastYear] = x.domain();
    const yearInput = d3.select("#inspect-year").attr("min", firstYear).attr("max", lastYear);
    const guide = chartSvg.append("g").attr("class", "rendered-element year-guide");
    const cursor = guide.append("line").attr("y2", height);
    const dots = guide.append("g");

    function inspectYear(year) {
        selectedYear = Math.max(firstYear, Math.min(lastYear, year));
        const rows = valuesByYear.get(selectedYear) ?? [];
        const label = d => `${scenarioNames[d.scenario]} ${formatAnomaly(d.tas_anomaly)} °C`;

        yearInput.property("value", selectedYear)
            .attr("aria-valuetext", [selectedYear, ...rows.map(label)].join(", "));
        d3.select("#selected-year").text(selectedYear);
        d3.select("#year-values").selectAll("span").data(rows, d => d.scenario)
            .join("span").text(label);

        cursor.attr("x1", x(selectedYear)).attr("x2", x(selectedYear));
        dots.selectAll("circle").data(rows, d => d.scenario).join("circle")
            .attr("cx", x(selectedYear)).attr("cy", d => y(d.tas_anomaly))
            .attr("r", 4).attr("fill", d => color(d.scenario));
    }

    chartSvg.append("rect").attr("class", "rendered-element year-hit-area")
        .attr("width", width).attr("height", height).attr("fill", "transparent")
        .on("pointermove pointerdown", event => {
            if (event.type === "pointermove" && event.pointerType === "touch") return;
            const [pointerX] = d3.pointer(event, chartSvg.node());
            inspectYear(Math.round(x.invert(pointerX)));
        });

    yearInput.on("input", event => inspectYear(event.target.valueAsNumber));
    d3.select(".year-inspector").property("hidden", false);
    inspectYear(selectedYear);
}

init();
