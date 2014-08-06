var mubsub = require('mubsub');
var client = mubsub('mongodb://swalo:84kAanan@ds051658.mongolab.com:51658/swalo');

var addonChannel = client.channel('addons');
var searchdatachannel = client.channel('searchdata');

client.on('error', console.error);
addonChannel.on('error', console.error);
searchdatachannel.on('error', console.error);

searchdatachannel.subscribe('NewRes', function (message) {
    var res = GetData(message);

    res = checkForDuplicates(res);

    res.forEach(function(item) {

        if(item.isDuplicate) {
            console.log("avoided duplicate insertion");
            return;
        }

        if(item.order <= 1 || (item.Markup > 5 && item.order < 5))
            addonChannel.publish("NewAddon", item);
        else
            addonChannel.publish("NewAddonProposal", item);
    });
});

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

        if(competitorprices.length == 0 || competitorprices[0].Price == undefined) //We are the only one
        {
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
            itinerary.SwaloPrice = swaloprices[0].Price.replace('.','');
            itinerary.BestCompetitorPrice = competitorprices[0].Price.replace('.','');
            itinerary.Markup = parseFloat(itinerary.SwaloPrice) - parseFloat(itinerary.BestCompetitorPrice);
        }
        /*
        console.log("SwaloPrice: ");
        console.log(itinerary.SwaloPrice);

        console.log("BestCompetitorPrice: ");
        console.log(itinerary.BestCompetitorPrice);
        */

        logItinerary(itinerary);
        
        if(itinerary.Markup > 8.9)
            return undefined;
        
        itinerary.Markup = itinerary.Markup * -1 - 0.1;

        delete itinerary.prices;
        
        return itinerary;
    });
    
    res = res.filter(function(item) {
        return item != undefined;
    });

    return res;
}

function logItinerary(itinerary)  {
    console.log(itinerary.Origin + ' ' + itinerary.Dest + ' ' + itinerary.OutboundLegDepartureDateTime + ' ' + itinerary.InboundLegDepartureDateTime + ' ' + itinerary.CarrierIds + ' ' + itinerary.Markup + ' ' + itinerary.order );
}