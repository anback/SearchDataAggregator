var mubsub = require('mubsub');
var client = mubsub('mongodb://swalo:84kAanan@ds051658.mongolab.com:51658/swalo');

var addonChannel = client.channel('addons');
var searchdatachannel = client.channel('searchdata');

client.on('error', console.error);
addonChannel.on('error', console.error);
searchdatachannel.on('error', console.error);

searchdatachannel.subscribe('NewRes', function (message) {
    var res = GetData(message);
    
    res.forEach(function(item) {
        addonChannel.publish("NewAddon", item);
    });
});

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

        console.log("SwaloPrice: ");
        console.log(itinerary.SwaloPrice);

        console.log("BestCompetitorPrice: ");
        console.log(itinerary.BestCompetitorPrice);

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
    console.log(itinerary.Origin + ' ' + itinerary.Dest + ' ' + itinerary.OutboundLegDepartureDateTime + ' ' + itinerary.InboundLegDepartureDateTime + ' ' + itinerary.CarrierIds + ' ' + itinerary.Markup);
}

/*
function GetData(res) {
    //Get SwaloRequestId

    var inProgress = res.QuoteRequests.some(function(item) {
        return item.HasLiveUpdateInProgress;
    });

    var SwaloQuoteRequests = res.QuoteRequests.filter(function (item) {
        return item.AgentId == 'swlo';
    });

    if(SwaloQuoteRequests.length == 0)
    {
        console.log("No Swalo result");
        return;
    }


    var SwaloQuoteRequestId = SwaloQuoteRequests[0].Id;
    console.log("Found Quote RequestId: " + SwaloQuoteRequestId);
    var ress = res;

    var swaloQuotes = res.Quotes.filter(function(quote) {
        return quote.QuoteRequestId == SwaloQuoteRequestId;
    });

    console.log("Found " + swaloQuotes.length + " swaloprices");
    console.log("Found " + res.Itineraries.length + " itineraries");


    var quotePriceById = {};

    for (var i = res.Quotes.length - 1; i >= 0; i--)
        quotePriceById[res.Quotes[i].Id] = {
            Price: res.Quotes[i].Price,
            IsSwaloQuote: res.Quotes[i].QuoteRequestId == SwaloQuoteRequestId
        }

    var that = res;

    var itineraries = res.Itineraries.map(function (itinerary) {

        var QuoteIds = itinerary.PricingOptions.reduce(function (a, b, index, array) {
            if(b.QuoteIds == undefined)
                    return a;
                return a.concat(b.QuoteIds);
        },[]);

        var itineraryPrices = QuoteIds.map(function (quoteId) {
            return quotePriceById[quoteId];
        })

        itineraryPrices = itineraryPrices.sort(function (a, b) {
            return a.Price - b.Price;
        });

        var swaloPrices = itineraryPrices.filter(function (price) {
            return price.IsSwaloQuote;
        });

        itinerary.SwaloPrice = swaloPrices.length > 0 ?
            swaloPrices[0].Price : undefined;
        
        //there is only one price returned for that itienrary
        if(itineraryPrices.length == 0)
            return undefined;

        if(itineraryPrices.length == 1)
            itinerary.BestCompetitorPrice = itineraryPrices[0].Price;
        else
            itinerary.BestCompetitorPrice = itineraryPrices[0].Price == itinerary.SwaloPrice ?
                itineraryPrices[1].Price : itineraryPrices[0].Price ;

        //Outbound och Inbound flight information
        itinerary.OutboundItineraryLeg = that.OutboundItineraryLegs.filter(function(outboundItineraryLeg) {
            return itinerary.OutboundLegId == outboundItineraryLeg.Id;
        })[0];

        itinerary.InboundItineraryLeg = that.InboundItineraryLegs.filter(function(inboundItineraryLeg) {
            return itinerary.InboundLegId == inboundItineraryLeg.Id;
        })[0];

        return itinerary;
    });

    //Clean all undefined itineraries
    itineraries = itineraries.filter(function(item) {
        return item != undefined;
    })

    //Only care about the first 30 itineraries (Skyscanner page 1)
    
    itineraries = itineraries.sort(function(a,b) {
        return a.BestCompetitorPrice - b.BestCompetitorPrice;
    }).slice(0,10);
    
    if(itineraries.length == 0)
        return;
    
    //Prepare Results, ToDest, FromDest, ToDate, FromDate, 
    //På varje SwaloItinerary, Sätt SwaloPosition, SwaloPrice, BestPrice
    var searchData = {};

    //Best Price On Search
    searchData.BestCompetitorPrice = itineraries.sort(function(a,b) {
        return a.BestCompetitorPrice - b.BestCompetitorPrice;
    })[0].BestCompetitorPrice;
    
    var swaloItineraries = itineraries.filter(function(item) {
        return item.SwaloPrice != undefined;
    });    

    console.log("Found SwaloItineraries: " + swaloItineraries.length); 

    if(swaloItineraries.length > 0)
    {
        //Best SwaloPrice On Search
        searchData.BestSwaloPrice = swaloItineraries.sort(function(a,b) {
            return a.SwaloPrice - b.SwaloPrice;
        })[0].SwaloPrice;
    }
    
    searchData.Origin = res.Query.OriginPlace;
    searchData.Dest = res.Query.DestinationPlace;
    searchData.FromDate = res.Query.OutboundDate;
    searchData.ToDate = res.Query.InboundDate;
    searchData.ItineraryCount = res.Itineraries.length;
    searchData.Itineraries = itineraries;
    searchData.SearchDate = res.SearchDate;

    var isSwaloSearch = searchData.Itineraries.some(function(item) {
        return item.SwaloPrice != undefined;
    });

    //stop if this is not a swalo searchData
    if(isSwaloSearch == false)
        return;

    //2nd Part Get out th itineraries and present on one line for report
    var res = searchData.Itineraries.map(function(item) {
        if(item.SwaloPrice == undefined)
            return;

        var res = {};

        res.EntireSearchBestCompetitorPrice = searchData.BestCompetitorPrice;
        res.EntireSearchBestSwaloPrice = searchData.BestSwaloPrice;

        res.BestCompetitorPrice = item.BestCompetitorPrice;
        res.SwaloPrice = item.SwaloPrice;

        res.SearchMarkup = searchData.BestSwaloPrice - searchData.BestCompetitorPrice;
        res.ItineraryMarkup = item.SwaloPrice - item.BestCompetitorPrice;

        if(item.InboundItineraryLeg == undefined)
            return undefined;

        res.OutboundItineraryLegMarketingCarrierIds = item.OutboundItineraryLeg.MarketingCarrierIds.join(',');
        res.InboundItineraryLegMarketingCarrierIds = item.InboundItineraryLeg.MarketingCarrierIds.join(',');

        res.OutboundItineraryLegOperatingCarrierIds = item.OutboundItineraryLeg.OperatingCarrierIds.join(',');
        res.InboundItineraryLegOperatingCarrierIds = item.InboundItineraryLeg.OperatingCarrierIds.join(',');

        res.OutboundItineraryLegStops = item.OutboundItineraryLeg.StopsCount;
        res.InboundItineraryLegStops = item.InboundItineraryLeg.StopsCount;

        res.OutboundItineraryLegDepartureDateTime = item.OutboundItineraryLeg.DepartureDateTime;
        res.OutboundItineraryLegArrivalDateTime = item.OutboundItineraryLeg.ArrivalDateTime;

        res.InboundItineraryLegDepartureDateTime = item.InboundItineraryLeg.DepartureDateTime;
        res.InboundItineraryLegArrivalDateTime = item.InboundItineraryLeg.ArrivalDateTime;

        res.Origin = ress.Stations.filter(function(station) {
            return station.Id == item.OutboundItineraryLeg.OriginStation;
        })[0].Code;

        res.Dest = ress.Stations.filter(function(station) {
            return station.Id == item.OutboundItineraryLeg.DestinationStation;
        })[0].Code;

        res.FromDate = this.OutboundItineraryLegDepartureDateTime;
        res.ToDate = this.InboundItineraryLegArrivalDateTime;
        res.SearchDate = searchData.SearchDate;

        
        if(res.ItineraryMarkup > 10.0)
            return undefined;

        res.ItineraryMarkup = res.ItineraryMarkup * -1 - 0.1;
        return res;
    });

    //Clean all undefined ress
    res = res.filter(function(item) {
        return item != undefined;
    });

    console.log(res.length);

    var ress = [];
    for (var i = res.length - 1; i >= 0; i--)
    {
        res[i].AllowedToAddAsAddon = true;
        for (var j = res.length - 1; j >= 0; j--) 
            if(j != i)
            {
                var istring = res[i].Origin + res[i].Dest + res[i].OutboundItineraryLegDepartureDateTime + res[i].InboundItineraryLegDepartureDateTime;
                var jstring = res[j].Origin + res[j].Dest + res[j].OutboundItineraryLegDepartureDateTime + res[j].InboundItineraryLegDepartureDateTime;
                //console.log(istring);
                //console.log(jstring);
                
                if(istring == jstring)
                {
                    console.log("They Are The Same!");
                    res[i].AllowedToAddAsAddon = false;
                }
            }
        if(res[i].AllowedToAddAsAddon == true)
            ress.push(res[i]);
    }

    console.log(ress.length);
    return ress;
}
*/

