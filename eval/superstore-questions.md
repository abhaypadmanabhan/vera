# Vera Benchmark — Superstore (17 verified Q&A)

Source: canonical Superstore dataset, 9,994 orders, 2016-2019. Answers computed with pandas.
Note: `OrderDate` is mixed-format free text (a realistic messy-data feature for the agent to handle); year questions use the clean `OrderYear` column.

Braintrust dataset mapping: `input`=question, `expected`=expected_answer.

| # | Question | Expected | How |
|---|---|---|---|
| 1 | What were total sales across the whole dataset? | 2297200.86 | sum(Sales) |
| 2 | What was total profit? | 286397.02 | sum(Profit) |
| 3 | What was the overall profit margin percentage? | 12.47 | sum(Profit)/sum(Sales)*100 |
| 4 | Which region had the highest sales? | West | groupby(Region).Sales.sum().idxmax |
| 5 | Which region had the lowest sales? | South | groupby(Region).Sales.sum().idxmin |
| 6 | What were total sales in the West region? | 725457.82 | West sales |
| 7 | Which product category was most profitable? | Technology | groupby(Category).Profit.sum().idxmax |
| 8 | How much profit did the Technology category generate? | 145454.95 | Technology profit |
| 9 | Which sub-category lost the most money? | Tables | groupby(Sub-Category).Profit.sum().idxmin |
| 10 | How much profit did the Tables sub-category make (a loss)? | -17725.48 | Tables profit |
| 11 | Which customer segment generated the most sales? | Consumer | groupby(Segment).Sales.sum().idxmax |
| 12 | What was the average discount across all orders? | 0.16 | mean(Discount) |
| 13 | How many total units (quantity) were sold? | 37873 | sum(Quantity) |
| 14 | How many unique orders are in the dataset? | 5009 | nunique(OrderID) |
| 15 | Which category had the lowest profit margin? | Furniture | min margin by category (Furniture) |
| 16 | What were total sales in 2019? | 733215.26 | OrderYear==2019 sales |
| 17 | What was sales growth from 2018 to 2019? | 20.36 | yr2019/yr2018-1 |
