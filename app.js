var mubsub = require('mubsub');
var client = mubsub('mongodb://swalo:84kAanan@ds051658.mongolab.com:51658/swalo');
var datejs = require('datejs');
var addonChannel = client.channel('addons');
var searchdatachannel = client.channel('searchdata');
var searchChannel = client.channel('searches');

client.on('error', console.error);
addonChannel.on('error', console.error);
searchdatachannel.on('error', console.error);
searchChannel.on('error', console.error);


var c = 0;
var d = 0;
searchdatachannel.subscribe('NewSearchData', function (message) {
    
    d++;
    if(!message.Itineraries.some(function(itinerary) {
        return itinerary.prices.some(function(price) {
            return price.OTA == 'Swalo'
        })
    }))
    {
        c++;
        console.log("No Swalo Price: " + c/d);
    }

    var res = GetData(message);

    res.forEach(function(item) {

        addonChannel.publish("NewAddonProposal", item);

        if(item.Markup > 0)
        {
            publishNewSearches(item); 
            addonChannel.publish("NewAddon", item)
        }
    });
});

function publishNewSearches(item) {

    for (var i =  - 3; i >= 3; i++) {
        var outboundDate = Date.parse(item.OutboundLegDepartureDateTime).add({ days : i});
        var inboundDate = Date.parse(item.InboundLegDepartureDateTime).add({ days : i});

        var res = {
            in_DepartureDate : outboundDate,
            in_ReturnDate : inboundDate,
            in_FromCity : item.Origin,
            in_ToCity : item.Dest
        };

        searchChannel.publish('NewSearch', res);
    };
}

function checkForDuplicates(res) {
    for (var i = res.length - 1; i >= 0; i--)
        {
            res[i].isDuplicate = false;
            for (var j = res.length - 1; j > i; j--) 
                if(j != i)
                {
                    var istring = res[i].Origin + res[i].Dest + res[i].OutboundItineraryLegDepartureDateTime + res[i].InboundItineraryLegDepartureDateTime;
                    var jstring = res[j].Origin + res[j].Dest + res[j].OutboundItineraryLegDepartureDateTime + res[j].InboundItineraryLegDepartureDateTime;
                    
                   if(istring == jstring)
                    {
                       console.log("They Are The Same!");
                       res[j].isDuplicate = true;
                   }
                }
        }

    return res;
}


function GetData(message) {
    var res = message.Itineraries.map(function(itinerary, index) {
        
        itinerary.order = index;

        itinerary.prices = itinerary.prices.map(function(item) {

            if(item.Price.indexOf('€') != -1)
            {
                item.Price = item.Price.split('€')[0].trim();
            }

            return item;
        });

        competitorprices = itinerary.prices.filter(function(price) {
            return price.OTA !== 'Swalo'
        });

        swaloprices = itinerary.prices.filter(function(price) {
            return price.OTA === 'Swalo'
        });

        if(swaloprices.length == 0)
            return undefined;

        if(swaloprices[0].Price == undefined)
            return undefined;

        itinerary.SwaloPrice = swaloprices[0].Price.replace('.','');


        if(competitorprices.length == 0 || competitorprices[0].Price == undefined) //We are the only one
        {
            return undefined;
            console.log("We are the only one!");
            itinerary.Markup = -30.0;
        }

        if(itinerary.Origin.length < 1)
            return undefined

        if(itinerary.OutboundLegDepartureDateTime == undefined)
            return undefined;

        if(itinerary.InboundLegDepartureDateTime == undefined)
            return undefined;
        
        itinerary.OutboundLegDepartureDateTime += ":00";
        itinerary.InboundLegDepartureDateTime += ":00";

        if(itinerary.Markup != -30.0)
        {
            itinerary.BestCompetitorPrice = competitorprices[0].Price.replace('.','');
            itinerary.Markup = parseFloat(itinerary.SwaloPrice) - parseFloat(itinerary.BestCompetitorPrice);
        }

        itinerary.Markup = itinerary.Markup * -1 - 0.1;

        delete itinerary.prices;

        logItinerary(itinerary);
        
        return itinerary;
    });
    
    res = res.filter(function(item) {
        return item != undefined;
    });

    return res;
}

function logItinerary(itinerary, suffix)  {

    if(suffix == undefined)
        suffix = '';
    console.log(itinerary.Origin + ' ' + itinerary.Dest + ' ' + ' ' + itinerary.CarrierIds + ' ' + itinerary.SwaloPrice +  ' ' + itinerary.Markup + ' ' + itinerary.order + ' ' + suffix);
}



